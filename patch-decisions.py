import os
import re

plans = {
    "02-01-PLAN.md": ["D-19", "D-28", "D-29", "D-30", "D-03"],
    "02-02-PLAN.md": ["D-24", "D-25", "D-26", "D-27"],
    "02-03-PLAN.md": ["D-01", "D-02", "D-04", "D-05", "D-06", "D-07", "D-22"],
    "02-04-PLAN.md": ["D-15", "D-16", "D-20", "D-21"],
    "02-05-PLAN.md": ["D-08", "D-09", "D-10", "D-11", "D-12", "D-13", "D-14", "D-17", "D-18", "D-23"]
}

base_dir = ".planning/phases/02-mcp-process-manager-json-rpc-client"

for plan, d_ids in plans.items():
    path = os.path.join(base_dir, plan)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Append to the first bullet point in <must_haves> block
    def replacer(match):
        block = match.group(0)
        id_str = f" [{', '.join(d_ids)}]"
        return re.sub(r'(<must_haves>\n\s*- [^\n]+)', r'\1' + id_str, block, count=1)
        
    new_content = re.sub(r'<must_haves>.*?</must_haves>', replacer, content, flags=re.DOTALL)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
print("Patched.")
