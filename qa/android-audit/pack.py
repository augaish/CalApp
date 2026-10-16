# Shrinks the screenshots and prints them as base64 lines in the job log, so
# they can be read back without downloading the artifact:
# python3 pack.py <folder>
import base64, io, os, sys
from PIL import Image

folder = sys.argv[1]
for name in sorted(os.listdir(folder)):
    if not name.endswith('.png'):
        continue
    im = Image.open(os.path.join(folder, name)).convert('RGB')
    im.thumbnail((432, 960))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=72)
    print(f'SHOT {name[:-4]} {base64.b64encode(buf.getvalue()).decode()}')
