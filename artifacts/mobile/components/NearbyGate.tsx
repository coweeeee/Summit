import React from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";
import EmptyState from "@/components/EmptyState";
import type { LocationPermission } from "@/lib/location";

// What Discover shows instead of a distance-sorted list when it has no position.
//
// Built on EmptyState rather than beside it. A blocked permission is not
// literally an empty state — the list is not empty, it just cannot be ordered —
// but the block is the same shape (icon, title, one line, one action) and a
// second near-identical component is exactly what EmptyState was extracted to
// stop. What differs per state is the copy and where the action goes, which is
// all this file is.
//
// Every branch below is reachable, which is the reason for a component rather
// than a ternary: "denied" and "blocked" look identical to a user and need
// opposite actions. Asking again when the OS will never show the dialog leaves
// a button that does nothing, which is how this normally ships broken.

type Props = {
  permission: LocationPermission;
  loading: boolean;
  error: string | null;
  canPrompt: boolean;
  onRequest: () => void;
  onRetry: () => void;
};

export default function NearbyGate({ permission, loading, error, canPrompt, onRequest, onRetry }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  // A fetch that failed for its own reasons, with permission intact. Worth
  // separating: telling someone to check their permissions when permissions are
  // fine sends them somewhere that cannot help.
  if (error) {
    return (
      <EmptyState
        icon="alert-circle"
        title="Couldn't get your location"
        message={error}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  switch (permission) {
    case "unsupported":
      return (
        <EmptyState
          icon="compass"
          title="Nearby isn't available here"
          message="Sorting by distance needs location services, which this build doesn't have. The other sorts all still work."
        />
      );

    case "undetermined":
    case "denied":
      return (
        <EmptyState
          icon="map-pin"
          title="Sort by what's closest"
          message="Summit uses your location to rank trails by how far away they are. It stays on your device and is only used for this sort."
          actionLabel={canPrompt ? "Use my location" : undefined}
          onAction={canPrompt ? onRequest : undefined}
        />
      );

    case "blocked":
      return (
        <EmptyState
          icon="map-pin"
          title="Location is turned off for Summit"
          message="Summit can't ask again from here. You can allow location for Summit in your device settings, then come back."
          actionLabel="Open Settings"
          onAction={() => { Linking.openSettings().catch(() => {}); }}
        />
      );

    case "services-off":
      return (
        <EmptyState
          icon="map-pin"
          title="Location services are off"
          message="Location is switched off for the whole device, so Summit can't tell how far away anything is."
          actionLabel="Open Settings"
          onAction={() => { Linking.openSettings().catch(() => {}); }}
        />
      );

    // Reached only between permission being granted and the first fix landing.
    case "granted":
      return (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
});
