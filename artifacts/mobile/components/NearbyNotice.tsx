import React from "react";
import { Linking } from "react-native";
import InlineNotice from "@/components/InlineNotice";
import type { LocationPermission } from "@/lib/location";

// The one-line banner Discover shows while it wants a position and hasn't got
// one. It sits above a working, top-rated list — Discover is perfectly usable
// without location, so this is an enhancement being offered, never a gate.
//
// A component rather than a ternary because "denied" and "blocked" look
// identical to a user and need opposite actions: asking again when the OS will
// never show the dialog leaves a button that does nothing, which is the usual
// way this ships broken. Every branch here is reachable.

type Props = {
  permission: LocationPermission;
  loading: boolean;
  error: string | null;
  canPrompt: boolean;
  onRequest: () => void;
  onRetry: () => void;
};

const openSettings = () => { Linking.openSettings().catch(() => {}); };

export default function NearbyNotice({ permission, loading, error, canPrompt, onRequest, onRetry }: Props) {
  // Gated first, and without an action: a banner offering "Enable location"
  // that flips to "Finding…" the instant it is tapped would otherwise flash on
  // every attempt. EmptyState.tsx documents the same rule for its own case.
  if (loading) {
    return <InlineNotice icon="loader" message="Finding your location…" />;
  }

  // Permission is fine and the fetch failed on its own — usually the timeout.
  // Kept separate because sending someone to their permission settings when
  // permissions are not the problem wastes the one action on offer.
  if (error) {
    return <InlineNotice icon="alert-circle" tone="attention" message={error} actionLabel="Try again" onAction={onRetry} />;
  }

  switch (permission) {
    case "undetermined":
    case "denied":
      return (
        <InlineNotice
          icon="map-pin"
          message="Sort by what's closest — Summit needs your location to work out distances."
          actionLabel={canPrompt ? "Enable location" : undefined}
          onAction={canPrompt ? onRequest : undefined}
        />
      );

    case "blocked":
      return (
        <InlineNotice
          icon="map-pin"
          tone="attention"
          // True for someone who *cannot* grant it, not only someone who won't:
          // iOS reports parental controls and MDM restrictions identically to a
          // permanent refusal, so this copy must fit both.
          message="Summit doesn't have access to your location, and can't ask from here."
          actionLabel="Open Settings"
          onAction={openSettings}
        />
      );

    case "services-off":
      return (
        <InlineNotice
          icon="map-pin"
          tone="attention"
          message="Location services are off for this device."
          actionLabel="Open Settings"
          onAction={openSettings}
        />
      );

    // Discover hides the Nearest sort where location cannot exist, so reaching
    // this means the sort was set some other way. Say nothing rather than
    // explain a control the user cannot see.
    case "unsupported":
      return null;

    // Granted but no fix yet, and nothing failed: the brief gap between the
    // permission landing and the first position. Silence is right — a banner
    // here would flash on every successful grant.
    //
    // A failure with the permission intact does NOT land here: it sets `error`
    // and is caught by the branch above. That routing is load-bearing, and it
    // is exactly what was broken — the timeout used to arrive as a bare
    // "granted" with its message discarded, so this `return null` swallowed the
    // app's only signal that the sort had silently stopped working.
    case "granted":
      return null;
  }
}
