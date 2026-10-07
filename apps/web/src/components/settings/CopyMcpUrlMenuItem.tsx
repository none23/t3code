import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { MenuItem } from "../ui/menu";
import { stackedThreadToast, toastManager } from "../ui/toast";

export function CopyMcpUrlMenuItem({ url }: { readonly url: string | null }) {
  const { copyToClipboard } = useCopyToClipboard<{ url: string }>({
    target: "MCP URL",
    onCopy: ({ url }) => {
      toastManager.add({
        type: "success",
        title: "MCP URL copied",
        description: `Add it to an agent, e.g. claude mcp add --transport http t3 ${url}`,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy MCP URL",
          description: error.message,
        }),
      );
    },
  });

  return url ? (
    <MenuItem onClick={() => copyToClipboard(url, { url })}>Copy MCP URL</MenuItem>
  ) : null;
}
