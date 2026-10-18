# Writes the app's saved state into AsyncStorage's folder in the simulator's
# data container: python3 seed.py <data container> <state.json>
# AsyncStorage (iOS) keeps a manifest.json; a value over 1 KB lives in its own
# file named by the MD5 of the key, with null in the manifest.
import hashlib, json, os, sys

container, state = sys.argv[1], sys.argv[2]
key = 'calapp-store'
base = os.path.join(container, 'Library', 'Application Support')
dirs = [os.path.join(base, d, 'RCTAsyncLocalStorage_V1') for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))] if os.path.isdir(base) else []
dirs = [d for d in dirs if os.path.isdir(d)] or [os.path.join(base, 'com.augaish.calapp', 'RCTAsyncLocalStorage_V1')]
for d in dirs:
    os.makedirs(d, exist_ok=True)
    mpath = os.path.join(d, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    manifest[key] = None
    json.dump(manifest, open(mpath, 'w'))
    open(os.path.join(d, hashlib.md5(key.encode()).hexdigest()), 'w').write(open(state).read())
    print('seeded', d)
