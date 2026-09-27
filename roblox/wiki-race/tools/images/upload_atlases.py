#!/usr/bin/env python3
"""Uploads the photo atlases (assets/images/atlas_NNN.jpg) to Roblox as Decals with the Open
Cloud Assets API, then writes src/server/Images/AssetIds.luau.

1. Create an API key at https://create.roblox.com/dashboard/credentials with the
   "Assets" API → Read + Write, and add your IP (or 0.0.0.0/0) to the allowed list.
2. Find your user id (the number in your profile URL) — or use --group-id for a group game.
   The game must be owned by the same user/group so the server can load the decals.
3. python tools/images/upload_atlases.py --api-key YOUR_KEY --user-id 12345

Re-running skips atlases that already have an id. Requires: requests (pip install requests).
Roblox moderates every upload; an atlas that gets rejected simply keeps showing meme cards.
"""
import argparse, glob, json, os, re, sys, time
import requests

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
ATLAS_DIR = os.path.join(ROOT, "assets", "images")
OUT = os.path.join(ROOT, "src", "server", "Images", "AssetIds.luau")
API = "https://apis.roblox.com/assets/v1"


def load_existing():
    ids = {}
    if os.path.exists(OUT):
        for m in re.finditer(r"\[(\d+)\] = \{ decal = (\d+) \}", open(OUT).read()):
            ids[int(m.group(1))] = int(m.group(2))
    return ids


def write(ids):
    lines = ["-- Roblox asset ids for the photo atlases (atlas index → { decal = id } or { image = id }).",
             "-- Written by tools/images/upload_atlases.py. Delete an entry to re-upload that atlas.", "return {"]
    for index in sorted(ids):
        lines.append("\t[%d] = { decal = %d }," % (index, ids[index]))
    lines.append("}")
    with open(OUT, "w") as f:
        f.write("\n".join(lines) + "\n")


def upload(path, index, key, creator):
    request = {
        "assetType": "Decal",
        "displayName": "WikiRace photos %03d" % index,
        "description": "Wiki Race encyclopedia photos (Wikimedia Commons, see credits)",
        "creationContext": {"creator": creator},
    }
    with open(path, "rb") as f:
        r = requests.post(
            API + "/assets",
            headers={"x-api-key": key},
            files={"request": (None, json.dumps(request), "application/json"), "fileContent": (os.path.basename(path), f, "image/jpeg")},
            timeout=120,
        )
    if r.status_code == 429:
        return "retry"
    r.raise_for_status()
    op = r.json()
    op_path = op.get("path") or ("operations/" + op["operationId"])
    for _ in range(60):
        if op.get("done"):
            break
        time.sleep(2)
        op = requests.get(API + "/" + op_path, headers={"x-api-key": key}, timeout=60).json()
    response = op.get("response") or {}
    asset_id = response.get("assetId")
    if not asset_id:
        print("  no asset id yet (still processing or moderated):", op, file=sys.stderr)
        return None
    return int(asset_id)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-key", required=True)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--user-id")
    group.add_argument("--group-id")
    args = ap.parse_args()
    creator = {"userId": args.user_id} if args.user_id else {"groupId": args.group_id}
    ids = load_existing()
    atlases = sorted(glob.glob(os.path.join(ATLAS_DIR, "atlas_*.jpg")))
    if not atlases:
        sys.exit("No atlases in assets/images — run tools/images/build_atlases.py first.")
    for path in atlases:
        index = int(re.search(r"atlas_(\d+)", path).group(1))
        if index in ids:
            continue
        for attempt in range(6):
            result = upload(path, index, args.api_key, creator)
            if result == "retry":
                time.sleep(10 * (attempt + 1))
                continue
            break
        if isinstance(result, int):
            ids[index] = result
            write(ids)
            print("atlas %03d → decal %d" % (index, result))
        time.sleep(1.5)
    write(ids)
    print("Done: %d/%d atlases have ids. Rebuild the place (rojo build) to ship them." % (len(ids), len(atlases)))


if __name__ == "__main__":
    main()
