import os
import json
from PIL import Image

def build_atlas():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    items_dir = os.path.join(base_dir, 'public', 'assets', 'items')
    out_img_path = os.path.join(base_dir, 'public', 'assets', 'items_atlas.png')
    out_json_path = os.path.join(base_dir, 'public', 'assets', 'items_atlas.json')

    categories = ['tools', 'furniture', 'plants', 'bakery', 'sewing', 'fishing', 'music']
    atlas_w, atlas_h = 2048, 1024
    atlas_img = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))

    frames = {}

    for row, cat in enumerate(categories):
        # Generator at column 0
        gen_path = os.path.join(items_dir, cat, 'generator.png')
        if os.path.exists(gen_path):
            img = Image.open(gen_path).convert('RGBA')
            x, y = 0, row * 128
            atlas_img.paste(img, (x, y))
            frames[f'{cat}_generator'] = {
                'frame': {'x': x, 'y': y, 'w': 128, 'h': 128},
                'rotated': False,
                'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': 128, 'h': 128},
                'sourceSize': {'w': 128, 'h': 128}
            }

        # Levels 1 to 9 at columns 1 to 9
        for lvl in range(1, 10):
            lvl_path = os.path.join(items_dir, cat, f'level_{lvl}.png')
            if os.path.exists(lvl_path):
                img = Image.open(lvl_path).convert('RGBA')
                x, y = lvl * 128, row * 128
                atlas_img.paste(img, (x, y))
                frames[f'{cat}_{lvl}'] = {
                    'frame': {'x': x, 'y': y, 'w': 128, 'h': 128},
                    'rotated': False,
                    'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': 128, 'h': 128},
                    'sourceSize': {'w': 128, 'h': 128}
                }

    # Coins at row 7, columns 0 to 4
    coin_row = 7
    for lvl in range(1, 6):
        coin_path = os.path.join(items_dir, 'coins', f'level_{lvl}.png')
        if os.path.exists(coin_path):
            img = Image.open(coin_path).convert('RGBA')
            x, y = (lvl - 1) * 128, coin_row * 128
            atlas_img.paste(img, (x, y))
            frames[f'coins_{lvl}'] = {
                'frame': {'x': x, 'y': y, 'w': 128, 'h': 128},
                'rotated': False,
                'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': 128, 'h': 128},
                'sourceSize': {'w': 128, 'h': 128}
            }

    meta = {
        'image': 'items_atlas.png',
        'format': 'RGBA8888',
        'size': {'w': atlas_w, 'h': atlas_h},
        'scale': 1
    }

    manifest = {'frames': frames, 'meta': meta}
    atlas_img.save(out_img_path, 'PNG', optimize=True)

    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f'Successfully built items atlas with {len(frames)} frames.')
    print(f'Atlas PNG: {out_img_path} ({os.path.getsize(out_img_path) / 1024:.1f} KB)')
    print(f'Atlas JSON: {out_json_path}')

if __name__ == '__main__':
    build_atlas()
