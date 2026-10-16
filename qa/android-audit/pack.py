# Shrinks the screenshots to JPEGs the session can read back from the repo:
# python3 pack.py <from folder> <to folder>
import os, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if not name.endswith('.png'):
        continue
    im = Image.open(os.path.join(src, name)).convert('RGB')
    im.thumbnail((540, 1200))
    im.save(os.path.join(dst, name[:-4] + '.jpg'), 'JPEG', quality=78)
