#------initial module setup----------------------------
from playwright.sync_api import sync_playwright
from collections import deque
import random
import os
from datetime import datetime


#-------session setup---------------------------------
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
    context = browser.new_context(
        storage_state="session.json",
        viewport={"width": 1600, "height": 900},
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    page = context.new_page()

    #------configuration----------------------------------
    # change this line between sessions
    ACTIVE_CATEGORY = "Drama"

    CATEGORY_MAP = {
        "SingingDancing": (119, "SingingDancing"),
        "Comedy":         (104, "Comedy"),
        "Sports":         (112, "Sports"),
        "AnimeComics":    (100, "AnimeComics"),
        "Relationship":   (107, "Relationship"),
        "Shows":          (101, "Shows"),
        "Lipsync":        (110, "Lipsync"),
        "DailyLife":      (105, "DailyLife"),
        "BeautyCare":     (102, "BeautyCare"),
        "Games":          (103, "Games"),
        "Society":        (114, "Society"),
        "Outfit":         (109, "Outfit"),
        "Cars":           (115, "Cars"),
        "Food":           (111, "Food"),
        "Animals":        (113, "Animals"),
        "Family":         (106, "Family"),
        "Drama":          (108, "Drama"),
        "FitnessHealth":  (117, "FitnessHealth"),
        "Education":      (116, "Education"),
        "Technology":     (118, "Technology"),
    }

    label_to_key = {
        "Singing & Dancing": "SingingDancing", "Comedy": "Comedy",
        "Sports": "Sports", "Anime & Comics": "AnimeComics",
        "Relationship": "Relationship", "Shows": "Shows",
        "Lipsync": "Lipsync", "Daily Life": "DailyLife",
        "Beauty Care": "BeautyCare", "Games": "Games",
        "Society": "Society", "Outfit": "Outfit", "Cars": "Cars",
        "Food": "Food", "Animals": "Animals", "Family": "Family",
        "Drama": "Drama", "Fitness & Health": "FitnessHealth",
        "Education": "Education", "Technology": "Technology",
    }

    min_dwell     = 2      # shortest duration on video (seconds)
    max_dwell     = 10     # longest duration on video (seconds)
    target_urls = 120       # total number of ulrs to capture 
    capture_chance = 0.5   # probability of capturing a given video's URL
    max_scrolls = target_urls * 4 # backstop for the script in case scrolling goes on too muhc

    category_type, folder_name = CATEGORY_MAP[ACTIVE_CATEGORY]
    output_dir = os.path.join("Archive", folder_name)
    os.makedirs(output_dir, exist_ok=True)
    timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_file = os.path.join(output_dir, f"{folder_name}_{timestamp_str}.txt")

    #-------tracking variables----------------------------
    captured_urls = []
    dwell_times   = []
    seen_urls     = set()
    session_start = datetime.now()

    print(f"Session started at {session_start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Category: {ACTIVE_CATEGORY} (categoryType={category_type})")
    print(f"Output: {output_file}\n")

    #-------navigate to explore page----------------------
    page.goto("https://www.tiktok.com/explore")
    page.wait_for_timeout(6000)

    #-------set up response interceptor-------------------
    found_video_ids = deque()

    def handle_response(response):
            try:
                if "explore/item_list" not in response.url:
                    return
                if f"categoryType={category_type}" not in response.url:
                    return
                data  = response.json()
                items = data.get("itemList", [])
                for item in items:
                    if isinstance(item, dict) and "item" in item:
                        item = item["item"]
                    video_id = item.get("id")
                    author   = item.get("author", {}).get("uniqueId")
                    if video_id and author:
                        url = f"https://www.tiktok.com/@{author}/video/{video_id}"
                        if url not in seen_urls:          # ← changed from: if url not in found_video_ids
                            seen_urls.add(url)            # ← add this line
                            found_video_ids.append(url)
            except Exception:
                pass

    page.on("response", handle_response)
   
    #-------select category + open feed (reusable for hard recovery)----
    def select_category_and_open_feed():
        print(f"Selecting category: {ACTIVE_CATEGORY}...")
        chips = page.locator('[data-testid="tux-web-interaction-container"]').all()
        for chip in chips:
            try:
                label = chip.inner_text().strip()
                if label_to_key.get(label) == ACTIVE_CATEGORY:
                    chip.scroll_into_view_if_needed()
                    chip.click()
                    print(f"  Clicked '{label}'")
                    break
            except:
                pass
        page.wait_for_timeout(3000)

        print("Opening feed view...")
        try:
            first_video = page.locator('[data-e2e="explore-card-info"]').first
            first_video.wait_for(timeout=5000)
            first_video.click()
            page.wait_for_timeout(6000)
            print("  Feed view opened.")
        except Exception as e:
            print(f"  Warning: could not click first video ({e})")

    def hard_reload_recovery():
        """Full page reload + re-select category + re-open feed.
        Used when soft recovery (click + ArrowDown) repeatedly fails to
        repopulate the queue, which usually means the explore feed has
        exhausted its current content window for this categoryType."""
        print("  >> HARD RELOAD recovery triggered.")
        try:
            page.goto("https://www.tiktok.com/explore")
            page.wait_for_timeout(6000)
            select_category_and_open_feed()
            print("  >> Hard reload recovery complete.")
        except Exception as e:
            print(f"  >> Hard reload recovery failed ({e})")

    select_category_and_open_feed()

#-------main scroll loop------------------------------
    scroll_count = 0
    empty_queue_retries = 0
    MAX_EMPTY_RETRIES = 3
    RECOVERY_WAIT = 2000
    SCROLL_WAIT_FAST   = 1200   # when queue has plenty buffered
    SCROLL_WAIT_NORMAL = 2000   # when queue is getting thin
    QUEUE_FAST_THRESHOLD = 5    # more than this many queued → use fast wait
    EMPTY_SCROLL_WAIT = 1000

    stall_round_count = 0       # counts consecutive soft-recovery rounds that failed to repopulate
    MAX_STALL_ROUNDS_BEFORE_HARD_RELOAD = 3
    MAX_HARD_RELOADS = 3        # give up on this category after this many hard reloads in a row
    hard_reload_count = 0

    try:
        while len(captured_urls) < target_urls and scroll_count < max_scrolls:
            scroll_count += 1
            print(f"Scroll {scroll_count}: captured {len(captured_urls)}/{target_urls}")

            if found_video_ids:
                empty_queue_retries = 0
                current_url = found_video_ids.popleft()
                if random.random() < capture_chance:
                    captured_urls.append(current_url)
                    print(f"  CAPTURED - {current_url}")
                else:
                    print(f"  SKIPPED  - {current_url}")

                try:
                    page.keyboard.press("ArrowDown")
                    wait_ms = SCROLL_WAIT_FAST if len(found_video_ids) > QUEUE_FAST_THRESHOLD else SCROLL_WAIT_NORMAL
                    page.wait_for_timeout(wait_ms)
                except Exception as e:
                    print(f"  Warning: ArrowDown failed ({e}), attempting recovery...")
                    page.wait_for_timeout(RECOVERY_WAIT)

            else:
                empty_queue_retries += 1
                print(f"  No URL available (empty queue, attempt {empty_queue_retries}/{MAX_EMPTY_RETRIES})")

            if empty_queue_retries >= MAX_EMPTY_RETRIES:
                print("  >> Feed stall detected. Attempting recovery...")
                try:
                    player = page.locator('[data-e2e="browse-video-container"]').first
                    player.wait_for(timeout=3000)
                    player.click()
                    page.wait_for_timeout(800)
                    print("  >> Clicked video player to restore focus")
                except Exception:
                    try:
                        page.locator("video").first.click()
                        page.wait_for_timeout(800)
                        print("  >> Clicked video element (fallback)")
                    except Exception:
                        print("  >> Could not locate player element")

                try:
                    for _ in range(3):
                        page.keyboard.press("ArrowDown")
                        page.wait_for_timeout(800)
                except Exception as e:
                    print(f"  >> Recovery keypress failed ({e})")

                # Poll for up to RECOVERY_WAIT ms instead of sleeping the full duration
                waited = 0
                poll_interval = 500
                while waited < RECOVERY_WAIT:
                    if found_video_ids:
                        print(f"  >> Queue repopulated after {waited}ms")
                        break
                    page.wait_for_timeout(poll_interval)
                    waited += poll_interval
                else:
                    print(f"  >> Recovery wait complete ({RECOVERY_WAIT}ms), queue still empty")

                empty_queue_retries = 0
                scroll_count -= 1

                if found_video_ids:
                    # Soft recovery worked — reset stall escalation counters
                    stall_round_count = 0
                    hard_reload_count = 0
                else:
                    stall_round_count += 1
                    print(f"  >> Soft recovery failed ({stall_round_count}/{MAX_STALL_ROUNDS_BEFORE_HARD_RELOAD} stalled rounds)")

                    if stall_round_count >= MAX_STALL_ROUNDS_BEFORE_HARD_RELOAD:
                        if hard_reload_count >= MAX_HARD_RELOADS:
                            print(f"  >> Hard reload limit reached ({MAX_HARD_RELOADS}). "
                                  f"Feed appears exhausted for this category — ending session early.")
                            break

                        hard_reload_count += 1
                        stall_round_count = 0
                        hard_reload_recovery()

                        # give the reloaded feed a moment to start streaming item_list responses
                        waited = 0
                        while waited < RECOVERY_WAIT:
                            if found_video_ids:
                                print(f"  >> Queue repopulated after hard reload ({waited}ms)")
                                break
                            page.wait_for_timeout(poll_interval)
                            waited += poll_interval
                        else:
                            print("  >> Queue still empty after hard reload.")

    except Exception as e:
        print(f"\nUnexpected error in scroll loop: {e}")

    finally:
        #-------session conclusion----------------------------
        session_end      = datetime.now()
        session_duration = session_end - session_start
        total_minutes    = session_duration.total_seconds() / 60

        try:
            browser.close()
            print("\nBrowser closed. Writing output file...")
        except Exception:
            print("\nBrowser already closed. Writing output file...")

        #-------write output file-----------------------------
        with open(output_file, "w") as f:
            for url in captured_urls:
                f.write(url + "\n")

            f.write("\n")
            f.write("--" * 50 + "\n")
            f.write("SESSION METADATA\n")
            f.write("--" * 50 + "\n")
            f.write(f"DATE & TIME:          {session_start.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"CATEGORY:             {ACTIVE_CATEGORY} (categoryType={category_type})\n")
            f.write(f"SESSION DURATION:     {total_minutes:.1f} minutes\n")
            f.write(f"VIDEOS SCROLLED:      {scroll_count}\n")
            f.write(f"URLS CAPTURED:        {len(captured_urls)}\n")

        print(f"\nDone. {len(captured_urls)} URLs captured and saved to {output_file}")