import { ActionSheetIOS, Alert, Platform } from "react-native";

// The "..." overflow menu, in one place.
//
// iOS gets a real bottom action sheet, which is what a "..." button means on
// that platform. Android has no built-in equivalent in React Native, so it
// falls back to an Alert -- the same thing the profile menu used everywhere
// before this existed, which on iOS rendered as a centred dialog rather than a
// sheet.

export type SheetAction = {
  label: string;
  onPress: () => void;
  /** Rendered in red. iOS honours only the first one. */
  destructive?: boolean;
};

export function showActionSheet(title: string, actions: SheetAction[]) {
  if (actions.length === 0) return;

  if (Platform.OS === "ios") {
    const options = [...actions.map(a => a.label), "Cancel"];
    const destructiveButtonIndex = actions.findIndex(a => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: options.length - 1,
        ...(destructiveButtonIndex >= 0 ? { destructiveButtonIndex } : {}),
        userInterfaceStyle: "dark",
      },
      index => {
        // Dismissing reports the cancel index, so bounds-check rather than
        // trusting the callback to only fire for real selections.
        if (index >= 0 && index < actions.length) actions[index].onPress();
      }
    );
    return;
  }

  Alert.alert(title, undefined, [
    ...actions.map(a => ({
      text: a.label,
      style: a.destructive ? ("destructive" as const) : ("default" as const),
      onPress: a.onPress,
    })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}
