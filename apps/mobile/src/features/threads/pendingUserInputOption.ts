import type { UserInputQuestionOption } from "@t3tools/contracts";

export function derivePendingUserInputOptionCopy(option: UserInputQuestionOption): {
  readonly description: string | null;
  readonly accessibilityLabel: string;
} {
  const description = option.description.trim();
  const visibleDescription =
    description.length > 0 && description !== option.label.trim() ? description : null;

  return {
    description: visibleDescription,
    accessibilityLabel: visibleDescription
      ? `${option.label}. ${visibleDescription}`
      : option.label,
  };
}
