import Constants from "expo-constants";
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

// Leaflet in a WebView, lifted out of trail-detail so the Discover cards can
// show the same map.
//
// Deliberately not react-native-maps, which is what the Discover map tab uses:
// that package is null in Expo Go, so the tab is simply dead there, whereas
// this degrades to a coordinates card with an "Open in Maps" button. Running
// two map stacks is a known inconsistency -- see the scoping note in the
// commit that introduced this file.

const isExpoGo = Constants.appOwnership === "expo";

// OpenTopoMap's terms (and OSM's ODbL underneath it) require visible
// attribution, so attributionControl stays on and the tile layer carries the
// credit line. Do not disable it.
const TILE_ATTRIBUTION =
  'map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | ' +
  'style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';

function buildHtml(lat: number, lng: number, zoom: number): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>*{margin:0;padding:0}#map{width:100vw;height:100vh;background:#1a2a1a}.leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,0.55);color:#e8e8e8}.leaflet-control-attribution a{color:#9ecfa8}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false}).setView([${lat},${lng}],${zoom});L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'${TILE_ATTRIBUTION}'}).addTo(map);var icon=L.divIcon({html:'<div style="background:#6db87a;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',iconSize:[14,14],iconAnchor:[7,7],className:''});L.marker([${lat},${lng}],{icon:icon}).addTo(map);<\/script><\/body><\/html>`;
}

export function openInMapsApp(lat: number, lng: number, name: string) {
  const url = Platform.OS === "ios"
    ? `maps://?ll=${lat},${lng}&q=${encodeURIComponent(name)}`
    : `geo:${lat},${lng}?q=${encodeURIComponent(name)}`;
  Linking.openURL(url);
}

export default function TrailMap({
  lat,
  lng,
  name,
  height = 200,
  zoom = 13,
  style,
}: {
  lat: number;
  lng: number;
  name: string;
  height?: number;
  zoom?: number;
  style?: object;
}) {
  if (isExpoGo) {
    return (
      <View style={[styles.container, { height }, styles.fallback, style]}>
        <Text style={styles.fallbackIcon}>🗺️</Text>
        <Text style={styles.fallbackName} numberOfLines={1}>{name}</Text>
        <Text style={styles.fallbackCoords}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
        <Pressable onPress={() => openInMapsApp(lat, lng, name)} style={styles.fallbackBtn}>
          <Text style={styles.fallbackBtnText}>Open in Maps</Text>
        </Pressable>
      </View>
    );
  }

  // Required lazily so Expo Go never resolves the native module at all.
  const WebView = require("react-native-webview").WebView;
  return (
    <View style={[styles.container, { height }, style]}>
      <WebView
        source={{ html: buildHtml(lat, lng, zoom) }}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
      {/* The embedded map is for orientation; actually walking there means
          handing the coordinates to a real maps app. Top-right so it never
          covers the OpenTopoMap attribution along the bottom. */}
      <Pressable onPress={() => openInMapsApp(lat, lng, name)} style={styles.openBtn}>
        <Text style={styles.openBtnText}>Open in Maps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  webview: { flex: 1, backgroundColor: Colors.bg3 },
  openBtn: { position: "absolute", top: 8, right: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  openBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff" },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg3, gap: 4 },
  fallbackIcon: { fontSize: 28 },
  fallbackName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  fallbackCoords: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text2 },
  fallbackBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: Colors.green2 },
  fallbackBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
});
