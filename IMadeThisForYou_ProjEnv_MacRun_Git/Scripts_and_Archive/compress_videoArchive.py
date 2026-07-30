#------------Imports----------------#
import subprocess
import argparse
from pathlib import Path

#-----------Configuration------------# 
ARCHIVE_ROOT = Path(__file__).resolve().parent / "Archive"
TARGET_HEIGHT = 480
CRF_VALUE = 26          # lower = higher quality/larger file, higher = more compression. 18-28 is the typical usable range.
VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".avi")

#-----------Category Discovery-----------# 
def get_all_categories(): 
    """Find every folder inside ARCHIVE_ROOT that contains a 'videos' subfolder."""
    return sorted([
        folder.name for folder in ARCHIVE_ROOT.iterdir()
        if folder.is_dir() and (folder / "videos").exists()
    ])

#----------Single File Compression-----------#
def compress_video(input_path, output_path): 
    """ Run ffmpeg on one video file. Returns true on success, False on failure"""
    command = [
        "ffmpeg",
        "-y",                              # overwrite output if it already exists
        "-i", str(input_path),
        "-vf", f"scale=-2:{TARGET_HEIGHT}",
        "-c:v", "libx264",
        "-crf", str(CRF_VALUE),
        "-preset", "veryfast",     # encode speed vs. compression efficiency tradeoff
        "-an",                             # strip audio entirely
        "-movflags", "+faststart",
        str(output_path)
    ] 
    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"    ffmpeg error: {result.stderr.strip()[-300:]}")
    
    return result.returncode == 0

#----------Category Batch Processing-----------#
def process_category(category_name): 
    """Compress every video in one category's 'videos' folder into 'videos_compressed'."""
    category_folder = ARCHIVE_ROOT / category_name
    input_folder = category_folder / "videos"
    output_folder = category_folder / "videos_compressed"

    if not input_folder.exists():
        print(f"Skipping {category_name} - no 'videos' folder found.")
        return
    
    output_folder.mkdir(exist_ok = True)

    video_files = [f for f in input_folder.iterdir() if f.suffix.lower() in VIDEO_EXTENSIONS]

    success_count = 0 
    fail_count = 0

    print(f"\nStarting category: {category_name} ({len(video_files)} videos)")

    for index, video_file in enumerate(video_files, start=1):
        output_path = output_folder / video_file.name

        if output_path.exists():
            print(f"  [{index}/{len(video_files)}] Already compressed, skipping: {video_file.name}")
            success_count += 1
            continue

        print(f"  [{index}/{len(video_files)}] Encoding: {video_file.name}")
        if compress_video(video_file, output_path):
            success_count += 1
        else:
            fail_count += 1
            print(f"  [{index}/{len(video_files)}] FAILED: {video_file.name}")
    
    print(f"Finished {category_name}: {success_count} succeeded, {fail_count} failed, out of {len(video_files)} total")

#----------Command-Line Argument Parsing & Main------------# 
def prompt_for_category(valid_categories): 
    """Keep asking until the user gives a valid category name or 'all'."""
    while True:
        user_input = input("Enter a category name or 'all': ").strip()
        if user_input.lower() == "all":
            return "all"
        if user_input in valid_categories:
            return user_input
        print(f"'{user_input}' isn't a recognized category. Valid options: {valid_categories}")


def main(): 
    parser = argparse.ArgumentParser(description="Batch compress the video archive by category.")
    parser.add_argument(
        "--category",
        type = str, 
        default = "", 
        help = "Category name to compress (e.g. 'Animals'), or 'all' to run every category."
    )
    args = parser.parse_args()

    valid_categories = get_all_categories()
    requested = args.category.strip()

    if requested.lower() == "all":
        selection = "all"
    elif requested in valid_categories:
        selection = requested
    else: 
        if requested: 
            print(f"'{requested}' isn't a recognized category.")
        selection = prompt_for_category(valid_categories)
    
    if selection == "all": 
        categories = valid_categories
        print(f"Running all {len(categories)} categories: {categories}")
    else:
        categories = [selection]

    for category_name in categories: 
        process_category(category_name)
    
    print ("\nAll requested categories complete.")

if __name__ == "__main__":
    main() 