import os

hex_replacements = [
    ('bg-[#e8f0fe]', 'bg-blue-500/10'),
    ('text-[#1a73e8]', 'text-blue-500'),
    ('text-[#bdc1c6]', 'text-muted-foreground'),
    ('bg-[#1a73e8]', 'bg-primary'),
    ('text-[#e8f0fe]', 'text-primary-foreground'),
    ('bg-[#e8eaed]', 'bg-muted'),
    ('text-[#ea4335]', 'text-red-500'),
    ('bg-[#fce8e6]', 'bg-red-500/10'),
    ('text-[#fbbc04]', 'text-yellow-500'),
    ('bg-[#fef7e0]', 'bg-yellow-500/10'),
    ('text-[#34a853]', 'text-green-500'),
    ('bg-[#e6f4ea]', 'bg-green-500/10'),
    ('text-[#444746]', 'text-foreground'),
    ('bg-[#e8f5e9]', 'bg-green-500/10'),
    ('bg-[#111827]', 'bg-foreground'),
    ('border-[#111827]', 'border-foreground'),
    ('bg-[#f3f4f6]', 'bg-muted'),
    ('border-[#d1d5db]', 'border-border'),
    ('hover:bg-[#fce8e6]', 'hover:bg-red-500/20'),
    ('hover:border-[#ea4335]', 'hover:border-red-500'),
    ('hover:bg-[#fef7e0]', 'hover:bg-yellow-500/20'),
    ('hover:border-[#fbbc04]', 'hover:border-yellow-500'),
    ('hover:bg-[#e6f4ea]', 'hover:bg-green-500/20'),
    ('hover:border-[#34a853]', 'hover:border-green-500'),
    ('hover:bg-[#e8f0fe]', 'hover:bg-blue-500/20'),
    ('hover:border-[#1a73e8]', 'hover:border-blue-500'),
    ('hover:bg-[#333]', 'hover:bg-foreground/90'),
    ('text-background text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5', 'text-background text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5'), # Just making sure text-white is fixed to text-background inside the black circle in summary
]

files = [
    'frontend/app/notebook/[id]/summary/summary-client.tsx',
    'frontend/app/notebook/[id]/mindmap/mindmap-client.tsx',
    'frontend/app/notebook/[id]/flashcards/flashcards-client.tsx',
]

for fpath in files:
    with open(fpath, 'r') as f:
        content = f.read()
    for old, new in hex_replacements:
        content = content.replace(old, new)
    with open(fpath, 'w') as f:
        f.write(content)

print("Done hex replacements")
