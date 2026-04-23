
import sys

def count_tags(filename, start, end):
    with open(filename, 'r') as f:
        lines = f.readlines()
    content = "".join(lines[start-1:end])
    o = content.count("<div")
    c = content.count("</div")
    return o, c

o, c = count_tags('/Users/tomi/wardix/lms/src/components/TrainingInternalList.tsx', 673, 1933)
print(f"Main Return Open: {o}, Close: {c}")
