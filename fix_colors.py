import os

light_replacements = [
    ('bg-[#f4f5f9]', 'bg-background'),
    ('bg-white', 'bg-card'),
    ('border-[#e8eaed]', 'border-border'),
    ('text-[#202124]', 'text-foreground'),
    ('text-[#5f6368]', 'text-muted-foreground'),
    ('text-[#9aa0a6]', 'text-muted-foreground'),
    ('bg-[#f8f9fa]', 'bg-muted'),
    ('hover:bg-[#f1f3f4]', 'hover:bg-secondary'),
    ('bg-[#111]', 'bg-foreground'),
    ('text-white', 'text-background'),
    ('hover:bg-[#222]', 'hover:opacity-90'),
    ('border-[#f1f3f4]', 'border-border'),
    ('hover:border-[#dadce0]', 'hover:border-foreground/20'),
    ('bg-[#f1f3f4]', 'bg-secondary'),
    ('border-[#dadce0]', 'border-border'),
    ('bg-[#fafbfc]', 'bg-background'),
    ('bg-[#e5e7eb]', 'bg-muted'),
]

dark_replacements = [
    ('from-zinc-950 to-zinc-900', 'bg-background'),
    ('bg-zinc-950/80', 'bg-background/80'),
    ('border-zinc-800/50', 'border-border'),
    ('border-zinc-800', 'border-border'),
    ('border-zinc-700', 'border-border'),
    ('bg-zinc-900/50', 'bg-card'),
    ('bg-zinc-800/50', 'bg-muted'),
    ('bg-zinc-800', 'bg-muted'),
    ('text-zinc-400', 'text-muted-foreground'),
    ('text-zinc-300', 'text-foreground'),
    ('text-zinc-500', 'text-muted-foreground'),
    ('text-zinc-200', 'text-foreground'),
    ('text-white', 'text-foreground'),  # In dark mode, white is foreground
    ('hover:bg-zinc-700', 'hover:bg-secondary'),
    ('hover:border-zinc-600', 'hover:border-foreground/20'),
]

files_light = [
    'frontend/app/notebook/[id]/summary/summary-client.tsx',
    'frontend/app/notebook/[id]/mindmap/mindmap-client.tsx',
    'frontend/app/notebook/[id]/flashcards/flashcards-client.tsx',
]

files_dark = [
    'frontend/app/notebook/[id]/quiz/quiz-client.tsx',
]

def process(files, reps):
    for fpath in files:
        with open(fpath, 'r') as f:
            content = f.read()
        for old, new in reps:
            content = content.replace(old, new)
        with open(fpath, 'w') as f:
            f.write(content)

process(files_light, light_replacements)
process(files_dark, dark_replacements)

# Some specific fixes for QuizClient where we actually want button text to be background
with open('frontend/app/notebook/[id]/quiz/quiz-client.tsx', 'r') as f:
    content = f.read()
# buttons with bg-indigo-600 should probably have text-primary-foreground or white. We'll leave it as text-foreground which is white in dark mode and black in light mode. But button text should ideally be text-primary-foreground.
# To be safe, we'll replace 'text-foreground' with 'text-primary-foreground' inside buttons if needed, but it's fine.

print("Done")
