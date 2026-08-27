# Neovim file editing

Web and desktop clients can use Neovim inside the right-panel file editor. Enable **Use Neovim for
file editing** in **Settings → Integrations**. The setting is off by default and is stored separately
by each browser or desktop client.

When enabled, opening a text file from agent output, the file explorer, project search, or a diff
filename opens your environment's `nvim` executable with your normal configuration and plugins.
Neovim starts in the thread's worktree root and remains attached to that thread while you switch
threads or reconnect. Each listed file buffer appears as a file tab. Switching buffers inside
Neovim activates the matching tab and updates the highlighted file in the file explorer. Images
continue to use the built-in preview.

Closing the right panel stops its Neovim process and discards modified buffers.
Saving from Neovim refreshes the file view, file index, and source-control status immediately. If
`nvim` cannot start, the file panel shows the error instead of falling back to the built-in editor.

The Neovim session runs on the environment host, so the feature also works when the web or desktop
client connects to a remote T3 Code server. Mobile clients do not expose embedded Neovim sessions.
