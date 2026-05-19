import cv2
import os
import sys
import uuid
import json
import subprocess  # For the FFmpeg video pipe
import re          # For text replacements
import time        # For the retry delay
from gtts import gTTS         # Using gTTS
from pydub import AudioSegment
from ultralytics import YOLO

# filenames that must be present in the models folder; order is preserved when combining detections
REQUIRED_MODEL_FILES = [
    "best.pt",      # primary/custom model (usually custom-trained weights)
    "yolov8m.pt"    # fallback/secondary model (pretrained medium model)
]

try:
    import requests
except ImportError:
    requests = None

translations = {
    'WARN_CAR_FRONT': {
        'en': 'Warning, {name} {position}. Do not move forward.',
        'hi': 'चेतावनी, {name} {position}. आगे मत बढ़ो।',
        'te': 'హెచ్చరిక, {name} {position}. ముందుకు వెళ్లవద్దు.'
    },
    'CAR_POS': {
        'en': 'There is a {name} {position}.',
        'hi': 'एक {name} {position} है।',
        'te': 'ఒక {name} {position} ఉంది.'
    },
    'WARN_TRUCK_FRONT': {
        'en': 'Warning, {name} {position}. Do not move forward.',
        'hi': 'चेतावनी, {name} {position}. आगे मत बढ़ो।',
        'te': 'హెచ్చరిక, {name} {position}. ముందుకు వెళ్లవద్దు.'
    },
    'TRUCK_POS': {
        'en': 'There is a {name} {position}.',
        'hi': 'एक {name} {position} है।',
        'te': 'ఒక {name} {position} ఉంది.'
    },
    'WARN_BUS_FRONT': {
        'en': 'Warning, {name} {position}. Do not move forward.',
        'hi': 'चेतावनी, {name} {position}. आगे मत बढ़ो।',
        'te': 'హెచ్చరిక, {name} {position}. ముందుకు వెళ్లవద్దు.'
    },
    'BUS_POS': {
        'en': 'There is a {name} {position}.',
        'hi': 'एक {name} {position} है।',
        'te': 'ఒక {name} {position} ఉంది.'
    },
    'PERSON_POS': {
        'en': 'Person {position}, be aware.',
        'hi': 'व्यक्ति {position}, सावधान रहें।',
        'te': 'ఒక వ్యక్తి {position} ఉన్నారు, జాగ్రత్తగా ఉండండి.'
    },
    'OTHER_OBJ': {
        'en': 'There is a {name} {position}.',
        'hi': 'एक {name} {position} है।',
        'te': 'ఒక {name} {position} ఉంది.'
    },
    'PATH_CLEAR': {
        'en': 'The path is clear.',
        'hi': 'रास्ता साफ है।',
        'te': 'మార్గం స్పష్టంగా ఉంది.'
    },
    'AUDIO_FAIL': {
        'en': 'Audio generation failed.',
        'hi': 'ऑडियो बनाने में विफल रहा।',
        'te': 'ఆడియో ఉత్పత్తి విఫలమైంది.'
    },

    # 2. Position Keywords
    'POSITION_KEYS': {
        'en': {'left': 'to your left', 'right': 'to your right', 'front': 'right in front of you', 'ahead': 'ahead of you', 'far': 'far ahead', 'and': 'and'},
        'hi': {'left': 'आपके बाईं ओर', 'right': 'आपके दाईं ओर', 'front': 'ठीक आपके सामने', 'ahead': 'आपसे आगे', 'far': 'काफी आगे', 'and': 'और'},
        'te': {'left': 'మీకు ఎడమ వైపున', 'right': 'మీకు కుడి వైపున', 'front': 'మీ ముందు', 'ahead': 'ముందు', 'far': 'చాలా ముందు', 'and': 'మరియు'}
    },

    # 3. Object Name Keywords
    'NAME_KEYS': {
        'en': {'person': 'person', 'car': 'car', 'truck': 'truck', 'bus': 'bus'},
        'hi': {'person': 'व्यक्ति', 'car': 'गाड़ी', 'truck': 'ट्रक', 'bus': 'बस'},
        'te': {'person': 'వ్యక్తి', 'car': 'కారు', 'truck': 'ట్రక్', 'bus': 'బస్సు'}
    }
}

def get_translation(key, lang, **kwargs):
    """Gets a translated string, falling back to English. Safely injects kwargs."""
    if key not in translations:
        return "Translation key not found."
    if lang not in translations[key]:
        lang = 'en'
    template = translations[key][lang]
    # Use format_map with a default dict to avoid KeyError if some kwargs missing
    class Default(dict):
        def __missing__(self, k): return '{' + k + '}'
    return template.format_map(Default(kwargs))

def translate_name(name, lang):
    """Translates a common object name, falling back to the original name."""
    if not name:
        return name
    name_lower = name.lower()
    name_map = translations['NAME_KEYS'].get(lang, translations['NAME_KEYS'].get('en', {}))
    return name_map.get(name_lower, name)

def download_default_model(dest_path):
    """Attempt to download a standard YOLOv8 model to ``dest_path``.
    Only works if ``requests`` is installed. Raises on failure."""
    # we pick the medium model as a default; feel free to change URL
    url = "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt"
    if not requests:
        raise RuntimeError("requests package is required to download models")
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    return dest_path


def locate_model(base_dir, filename):
    models_dir = os.path.join(base_dir, "models")
    # ensure models directory exists
    if not os.path.isdir(models_dir):
        os.makedirs(models_dir, exist_ok=True)
        raise FileNotFoundError(
            f"Models directory created at {models_dir}, but it is empty. "
            "Please download YOLO weight files (*.pt) and place them there."
        )

    candidate = os.path.join(models_dir, filename)
    if os.path.exists(candidate):
        # verify file size is reasonable (>100KB)
        size = os.path.getsize(candidate)
        if size < 100_000:
            print(f"⚠ Model '{filename}' exists but is very small ({size} bytes).")
            # try to download a default if requests available
            if requests:
                print("⬇ Attempting to download a valid weight file...")
                try:
                    download_default_model(candidate)
                    size = os.path.getsize(candidate)
                    print(f"⬇ Downloaded, new size {size} bytes.")
                except Exception as e:
                    print(f"⛔ Download failed: {e}")
            else:
                print("⛔ 'requests' not installed; cannot auto-download.")
            if os.path.getsize(candidate) < 100_000:
                raise FileNotFoundError(
                    f"Model file '{candidate}' is empty or invalid. "
                    "Please replace it with a real YOLO .pt weight."
                )
        return candidate
    # fallback: pick any .pt file if available
    for f in os.listdir(models_dir):
        if f.lower().endswith(".pt"):
            alt = os.path.join(models_dir, f)
            print(f"⚠ Default model '{filename}' not found; using '{f}' instead.")
            return alt
    raise FileNotFoundError(
        f"No YOLO model files (*.pt) found in {models_dir}. "
        "Please download or place the appropriate weights there."
    )


def load_models(base_dir, filenames=None):
    """Locate and instantiate all YOLO models specified in ``filenames``.

    ``filenames`` should be a list of expected file names (relative to models/).
    If omitted, it defaults to ``REQUIRED_MODEL_FILES``. The function will raise pyta
    FileNotFoundError if any of the required weights cannot be located or if
    model instantiation fails. Returns a list of YOLO objects in the same order
    as ``filenames``.
    """
    if filenames is None:
        filenames = REQUIRED_MODEL_FILES
    models = []
    for fname in filenames:
        path = locate_model(base_dir, fname)
        # locate_model may return a different .pt when it fallbacks; ensure strict match
        if os.path.basename(path).lower() != fname.lower():
            raise FileNotFoundError(
                f"Expected model file '{fname}' but found '{os.path.basename(path)}'. "
                "Please place the correct file in the models directory."
            )
        try:
            print(f"⚙ Loading YOLO model from {path}")
            models.append(YOLO(path))
            print(f"✅ Model loaded: {os.path.basename(path)}")
        except Exception as e:
            raise RuntimeError(f"Error loading YOLO model '{path}': {e}")
    return models


def process_video_and_generate_audio(input_video_path, lang_code='en', model_files=None):
    """Process a video file and produce an audio description.

    This pipeline **requires two YOLO models** (see ``REQUIRED_MODEL_FILES``) to be
    present in the ``models/`` folder. Both are loaded via :func:`load_models`
    and their detections are merged on each sampled frame. If either model is
    missing or fails to load, the function returns an error dict immediately.

    ``lang_code`` determines the language for TTS output (e.g. ``'en'``, ``'hi'``).

    ``model_files`` may be an iterable of filenames to override the default
    ``REQUIRED_MODEL_FILES``; it is primarily used when the CLI ``--models``
    option is supplied.
    """
    job_id = str(uuid.uuid4())
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # ensure both required model files exist and load them
    try:
        models = load_models(base_dir, model_files)
    except Exception as e:
        return {"status": "error", "message": str(e)}

    results_dir = os.path.join(base_dir, "results", job_id)
    audio_temp_dir = os.path.join(results_dir, "temp_audio")
    final_audio_path = os.path.join(results_dir, "final_audio.mp3")
    final_video_path = os.path.join(results_dir, "final_video.mp4")

    os.makedirs(audio_temp_dir, exist_ok=True)

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        return {"status": "error", "message": "Cannot open video file."}

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frame_count = 0

    ffmpeg_cmd = [
        'ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-s', f'{frame_width}x{frame_height}',
        '-pix_fmt', 'bgr24', '-r', str(fps),
        '-i', '-', '-an', '-vcodec', 'libx264',
        '-pix_fmt', 'yuv420p', final_video_path
    ]
    ffmpeg_process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    last_known_detections = []
    all_alerts = []

    def get_natural_position(frame_width, frame_height, bbox, lang):
        """Calculates natural language position IN THE SPECIFIED LANGUAGE."""
        x1, y1, x2, y2 = bbox
        obj_cx = (x1 + x2) / 2
        pos_map = translations['POSITION_KEYS'].get(lang, translations['POSITION_KEYS']['en'])

        horizontal_pos = pos_map['left'] if obj_cx < frame_width * 0.4 else pos_map['right'] if obj_cx > frame_width * 0.6 else ""
        proximity = pos_map['front'] if y2 > frame_height * 0.75 else pos_map['ahead'] if y2 > frame_height * 0.5 else pos_map['far']

        if horizontal_pos:
            position_text = f"{proximity} {pos_map['and']} {horizontal_pos}"
        else:
            position_text = proximity

        return position_text

    def get_alert_key(object_name, position_text_en):
        """Generates a translation key based on object name and ENGLISH position."""
        name_lower = (object_name or "").lower()
        if 'car' in name_lower:
            return 'WARN_CAR_FRONT' if "front" in position_text_en else 'CAR_POS'
        elif 'truck' in name_lower:
            return 'WARN_TRUCK_FRONT' if "front" in position_text_en else 'TRUCK_POS'
        elif 'bus' in name_lower:
            return 'WARN_BUS_FRONT' if "front" in position_text_en else 'BUS_POS'
        elif 'person' in name_lower or 'pedestrian' in name_lower:
            return 'PERSON_POS'
        else:
            return 'OTHER_OBJ'

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_count += 1

        # Process every 30th frame
        if frame_count % 30 == 0:
            all_detections = []

            # Run each loaded YOLO model and merge detections
            for idx, m in enumerate(models, start=1):
                try:
                    results = m.predict(frame, conf=0.4, verbose=False)
                    for r in results:
                        for box in r.boxes:
                            all_detections.append({
                                "bbox": box.xyxy[0].tolist(),
                                "name": m.names[int(box.cls[0])]
                            })
                except Exception as e:
                    print(f"Model {idx} predict error: {e}")

            last_known_detections = all_detections

            closest_object = max(all_detections, key=lambda det: (det["bbox"][2] - det["bbox"][0]) * (det["bbox"][3] - det["bbox"][1]), default=None)

            if closest_object:
                # 1. English name
                name_en = closest_object["name"]

                # 2. English position (for logic)
                pos_text_en = get_natural_position(frame_width, frame_height, closest_object["bbox"], 'en')

                # 3. Translated position (for audio)
                pos_text_lang = get_natural_position(frame_width, frame_height, closest_object["bbox"], lang_code)

                # 4. Alert key
                alert_key = get_alert_key(name_en, pos_text_en)

                # 5. Translated name
                name_lang = translate_name(name_en, lang_code)

                # 6. Assemble final translated text (always in user's language)
                if alert_key == 'PERSON_POS':
                    translated_text = get_translation(alert_key, lang_code, position=pos_text_lang)
                else:
                    translated_text = get_translation(alert_key, lang_code, name=name_lang, position=pos_text_lang)

                # Append only translated text (language-safe)
                all_alerts.append(translated_text)
            else:
                # Path clear message in user's language
                all_alerts.append(get_translation('PATH_CLEAR', lang_code))

        # Draw boxes on every frame using last_known_detections
        for det in last_known_detections:
            try:
                x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
                name = det["name"]
                color = (0, 255, 0) # Green
                nlow = name.lower()
                if 'car' in nlow or 'truck' in nlow or 'bus' in nlow: color = (0, 0, 255)
                elif 'person' in nlow: color = (0, 255, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.rectangle(frame, (x1, y1 - 20), (x1 + max(60, len(name) * 10), y1), color, -1)
                cv2.putText(frame, name, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
            except Exception:
                pass

        try:
            ffmpeg_process.stdin.write(frame.tobytes())
        except (IOError, BrokenPipeError):
            print("Warning: FFmpeg pipe broke. Stopping video write.")
            break

    cap.release()
    try:
        ffmpeg_process.stdin.close()
        ffmpeg_process.wait()
    except Exception:
        pass

    # --- AUDIO: Process all alerts at the END using gTTS (user language) ---
    if not all_alerts:
        unique_alerts = [get_translation('PATH_CLEAR', lang_code)]
    else:
        # Remove only consecutive duplicates so that repeated immediate same messages aren't spammy
        unique_alerts = []
        last_alert = None
        for alert in all_alerts:
            if alert != last_alert:
                unique_alerts.append(alert)
                last_alert = alert

    print(f"⚙ Generating {len(unique_alerts)} unique audio segments in '{lang_code}'...")
    temp_audio_files = []
    combined_audio = AudioSegment.empty()

    try:
        for i, text in enumerate(unique_alerts):
            tts_file = os.path.join(audio_temp_dir, f"seg_{i:04d}.mp3")

            retries = 3
            while retries > 0:
                try:
                    # Generate TTS in specified language
                    tts = gTTS(text=text, lang=lang_code)
                    tts.save(tts_file)

                    seg = AudioSegment.from_mp3(tts_file)
                    combined_audio += seg + AudioSegment.silent(duration=700)
                    temp_audio_files.append(tts_file)
                    print(f"  ✅ Segment {i+1}/{len(unique_alerts)} created.")
                    break
                except Exception as e:
                    # Try to detect rate limit or network issue
                    err_str = str(e).lower()
                    retries -= 1
                    if '429' in err_str or 'rate' in err_str or 'timed out' in err_str:
                        print(f"  ⏳ Rate limit/network issue. Sleeping for 5s... ({retries} retries left)")
                        time.sleep(5)
                    else:
                        print(f"  ❌ gTTS error for segment {i}: {e}")
                        break

            if retries == 0:
                print(f"  ❌ Failed to generate segment {i} after retries. Skipping.")

        # Export the combined audio
        combined_audio.export(final_audio_path, format="mp3")
        print("✅ Final audio file created (online).")

    except Exception as e:
        print(f"Error during gTTS generation: {e}")
        try:
            tts = gTTS(text=get_translation('AUDIO_FAIL', lang_code), lang=lang_code)
            tts.save(final_audio_path)
        except Exception as e2:
            print(f"Also failed to create fallback TTS: {e2}")

    finally:
        for f in temp_audio_files:
            try: os.remove(f)
            except Exception: pass

    # Final checks for video/audio existence
    if not os.path.exists(final_video_path) or os.path.getsize(final_video_path) == 0:
        return {"status": "error", "message": "Processed video file was not created or is empty. Check FFmpeg install."}
    if not os.path.exists(final_audio_path) or os.path.getsize(final_audio_path) == 0:
        return {"status": "error", "message": "Final audio file was not created."}

    return {
        "status": "success",
        "job_id": job_id,
        "final_audio": final_audio_path,
        "final_video": final_video_path
    }


# ---------- Helper for preloading ----------
def preload_models(filenames=None):
    """Loads the YOLO models and exits. Useful for warming them up ahead of processing videos.
    Returns True if successful, False otherwise. ``filenames`` may override the defaults.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        models = load_models(base_dir, filenames)
        print("⚙ Preloading YOLO models...")
        # the actual instantiation happens inside load_models
        print("✅ Models preloaded successfully.")
        return True
    except Exception as e:
        print(f"❌ Error preloading YOLO models: {e}")
        return False

# ---------- optional watcher for autorun ------------------------------------
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    Observer = None
    FileSystemEventHandler = None


def watch_folder(directory, lang_code='en', model_files=None):
    """Watch ``directory`` for new video files and process them automatically.

    ``model_files`` will be forwarded to :func:`process_video_and_generate_audio`
    whenever a new file is detected, allowing custom model lists when using the
    watcher from the CLI.
    """
    if Observer is None:
        raise ImportError("watchdog package required (pip install watchdog)")

    class Handler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            path = event.src_path
            # naive filter by extension
            if os.path.splitext(path)[1].lower() in ('.mp4', '.avi', '.mov', '.mkv'):
                print(f"🔔 Detected new video: {path}")
                result = process_video_and_generate_audio(path, lang_code, model_files)
                print(json.dumps(result))

    print(f"👀 Watching {directory} for new videos (lang={lang_code})...")
    obs = Observer()
    obs.schedule(Handler(), directory, recursive=False)
    obs.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        obs.stop()
    obs.join()


if __name__ == "__main__":
    # CLI options: --preload / --watch <dir> [lang] / <video> [lang]
    # Optional: --models file1.pt,file2.pt to override REQUIRED_MODEL_FILES
    cli_models = None
    if "--models" in sys.argv:
        try:
            idx = sys.argv.index("--models")
            if idx + 1 < len(sys.argv):
                cli_models = sys.argv[idx + 1].split(',')
                # remove these entries so they don't confuse later parsing
                del sys.argv[idx:idx+2]
            else:
                print("Error: --models flag provided but no filenames given.")
                sys.exit(1)
        except ValueError:
            pass

    if len(sys.argv) == 1 or sys.argv[1] in ("--preload", "--load-models"):
        success = preload_models(cli_models)
        sys.exit(0 if success else 1)
    elif sys.argv[1] == "--watch" and len(sys.argv) >= 3:
        folder = sys.argv[2]
        lang = sys.argv[3] if len(sys.argv) >= 4 else 'en'
        watch_folder(folder, lang, model_files=cli_models)
    elif len(sys.argv) > 2:
        video_path_arg = sys.argv[1]
        lang_code_arg = sys.argv[2]
        data = process_video_and_generate_audio(video_path_arg, lang_code_arg, model_files=cli_models)
        print(json.dumps(data))
    elif len(sys.argv) > 1:
        video_path_arg = sys.argv[1]
        data = process_video_and_generate_audio(video_path_arg, model_files=cli_models)
        print(json.dumps(data))
    else:
        print(json.dumps({"status": "error", "message": "No video file path provided"}))
