# Prints the centre "x y" of the first on-screen element whose text or
# accessibility label is exactly the given text, from a uiautomator dump:
# python3 tap.py <dump.xml> <text>
import re, sys
import xml.etree.ElementTree as ET

want = sys.argv[2]
for node in ET.parse(sys.argv[1]).iter('node'):
    if want in (node.get('text'), node.get('content-desc')):
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
