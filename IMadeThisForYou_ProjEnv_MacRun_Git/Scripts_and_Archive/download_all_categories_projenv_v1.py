import yt_dlp
import os
import re
import time
import random

# -----Configuration----------------------------------
archive_path = "/Users/nathanscott/Documents/TMU_MasterOfDigitalMedia_2025-2026/Thesis/IMadeThisForYou_ProjEnv/Scripts_and_Archive/Archive"

FORMAT_STRING = "best[height<=720]/best"

# Pacing within a category (per-video)
VIDEO_SLEEP_MIN = 2
VIDEO_SLEEP_MAX = 5

# Pacing between categories (checkpoint pause for an overnight run)
CATEGORY_SLEEP_MIN = 60
CATEGORY_SLEEP_MAX = 150


# -----Category & URL file discovery-------------------
def discover_categories(archive_path):
    return sorted([
        d for d in os.listdir(archive_path)
        if os.path.isdir(os.path.join(archive_path, d))
    ])


def find_latest_url_file(category_folder, category):
    pattern = re.compile(
        rf"^{re.escape(category)}_(\d{{4}})-(\d{{2}})-(\d{{2}})_(\d{{2}})-(\d{{2}})-(\d{{2}})"
    )
    candidates = []
    for fname in os.listdir(category_folder):
        m = pattern.match(fname)
        if m:
            timestamp = "".join(m.groups())
            candidates.append((timestamp, fname))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return os.path.join(category_folder, candidates[0][1])


def load_urls(url_file):
    with open(url_file, "r") as f:
        return [line.strip() for line in f if "tiktok.com" in line]


# -----Per-category download---------------------------
def download_category(category, category_folder, url_file):
    videos_dir = os.path.join(category_folder, "videos")
    metadata_dir = os.path.join(category_folder, "metadata")
    os.makedirs(videos_dir, exist_ok=True)
    os.makedirs(metadata_dir, exist_ok=True)

    urls = load_urls(url_file)
    print(f"[{category}] {len(urls)} URLs queued from {os.path.basename(url_file)}")

    # video file and its .info.json sidecar are written in the SAME yt-dlp call,
    # so a video can never end up without metadata (or vice versa) due to two
    # tools disagreeing about which URLs succeeded.
    ydl_opts = {
        "format": FORMAT_STRING,
        "merge_output_format": "mp4",
        "outtmpl": {
            "default": os.path.join(videos_dir, "%(id)s.%(ext)s"),
            "infojson": os.path.join(metadata_dir, "%(id)s.info.json"),
        },
        "writeinfojson": True,
        "cookiesfrombrowser": ("chrome",),
        # native resume: already-archived ids are skipped automatically on rerun
        "download_archive": os.path.join(category_folder, "downloaded.txt"),
        "quiet": True,
        "no_warnings": True,
    }

    failed_log = os.path.join(category_folder, "failed_urls.txt")
    success_count, fail_count = 0, 0

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for i, url in enumerate(urls, 1):
            try:
                ydl.download([url])
                success_count += 1
            except Exception as e:
                fail_count += 1
                print(f"  [{category}] FAILED ({i}/{len(urls)}): {url} -> {e}")
                with open(failed_log, "a") as f:
                    f.write(f"{url}\t{e}\n")
            time.sleep(random.uniform(VIDEO_SLEEP_MIN, VIDEO_SLEEP_MAX))

    print(f"[{category}] done: {success_count} ok, {fail_count} failed (see failed_urls.txt)")
    return success_count, fail_count


# -----Main: sequential run across all categories------
def main():
    categories = discover_categories(archive_path)
    print(f"Found {len(categories)} categories. Starting sequential run.\n")

    summary = []
    for idx, category in enumerate(categories, 1):
        category_folder = os.path.join(archive_path, category)
        url_file = find_latest_url_file(category_folder, category)
        if not url_file:
            print(f"[{category}] no URL batch file found, skipping")
            continue

        print(f"=== Category {idx}/{len(categories)}: {category} ===")
        s, f = download_category(category, category_folder, url_file)
        summary.append((category, s, f))

        if idx < len(categories):
            cooldown = random.uniform(CATEGORY_SLEEP_MIN, CATEGORY_SLEEP_MAX)
            print(f"Cooling down {cooldown:.0f}s before next category...\n")
            time.sleep(cooldown)

    print("\n=== Run summary ===")
    for category, s, f in summary:
        print(f"  {category}: {s} ok, {f} failed")


if __name__ == "__main__":
    main()
