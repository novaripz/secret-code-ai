# Wiki import pipeline

Regenerates `src/wikidata/Vital/*.luau` (≈7.7k pages) from English Wikipedia. Requires Python 3
with `requests mwparserfromhell` (and `libzim pillow` for photos).

1. `python vital_list.py` → `vital4.json` (Level-4 Vital Articles list)
2. `python classify.py` → `candidates.json` (section → game category, drops unsafe sections)
3. `python dump_extract.py titles.json dump_leads.jsonl` — lead wikitext from the official
   multistream dump via byte-range requests (needs `dump/index.txt.bz2` from dumps.wikimedia.org)
4. `python build_pages.py` → `out/Vital_NN.luau`, `out/Bridges.luau`; copy into `src/wikidata/Vital/`
5. Photos: download a Kiwix `wikipedia_en_top_maxi` ZIM to `../zim/top.zim`, run `zim_photos.py`,
   then `../images/build_atlases.py` and `../images/upload_atlases.py`.

Safety layers (all must pass): section exclusions (`classify.py`), manual title/section list
(`exclusions.py`), title regex, sentence-level graphic/adult/drug/violence filter
(`build_pages.py`), pages that lose >40% of sentences are dropped, the in-game banned-subject
filter, and a human visual review of every photo before atlasing.
