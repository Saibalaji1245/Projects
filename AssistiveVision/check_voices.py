import pyttsx3

try:
    print("--- Finding all installed voices on your system... ---")
    engine = pyttsx3.init()
    voices = engine.getProperty('voices')
    
    if not voices:
        print("\nERROR: No voices found. Your pyttsx3 installation might be incomplete.")
    else:
        print(f"\nFound {len(voices)} voices:")
        for i, voice in enumerate(voices):
            print(f"\nVoice #{i}")
            print(f"  ID: {voice.id}")
            print(f"  Name: {voice.name}")
            print(f"  Languages: {voice.languages}")
            print(f"  Gender: {voice.gender}")

except Exception as e:
    print(f"An error occurred: {e}")

print("\n--- Script finished. ---")
