import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type DimRating = {
  name: string;
  score: number;
};

export type HikeEntry = {
  id: string;
  trailName: string;
  location: string;
  distanceMi: number;
  elevationFt: number;
  durationHr?: number;
  difficulty: string;
  overallScore: number;
  dimRatings: DimRating[];
  notes: string;
  date: string;
  likes: number;
};

type HikesContextType = {
  hikes: HikeEntry[];
  addHike: (hike: Omit<HikeEntry, "id" | "date" | "likes">) => void;
  likedIds: Set<string>;
  toggleLike: (id: string) => void;
};

const HikesContext = createContext<HikesContextType | null>(null);

const STORAGE_KEY = "summit_hikes";
const LIKES_KEY = "summit_likes";

const SEED_HIKES: HikeEntry[] = [
  {
    id: "1",
    trailName: "Half Dome via John Muir",
    location: "Yosemite NP, California",
    distanceMi: 14.2,
    elevationFt: 4800,
    durationHr: 8.5,
    difficulty: "Moderate",
    overallScore: 4.8,
    dimRatings: [
      { name: "Scenery", score: 5 },
      { name: "Difficulty", score: 4.5 },
      { name: "Views", score: 5 },
    ],
    notes: "Incredible views at the top. Cables section is thrilling. Start early to avoid crowds.",
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 24,
  },
  {
    id: "2",
    trailName: "Rattlesnake Ledge",
    location: "Olallie State Park, Washington",
    distanceMi: 4.0,
    elevationFt: 1100,
    durationHr: 2.5,
    difficulty: "Easy",
    overallScore: 4.2,
    dimRatings: [
      { name: "Trail Cond.", score: 4.5 },
      { name: "Views", score: 4 },
      { name: "Crowds", score: 2.5 },
    ],
    notes: "Great beginner hike. Gets very crowded on weekends. Views of the valley are worth it.",
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 11,
  },
  {
    id: "3",
    trailName: "Angels Landing",
    location: "Zion NP, Utah",
    distanceMi: 5.4,
    elevationFt: 1488,
    durationHr: 4.0,
    difficulty: "Hard",
    overallScore: 4.9,
    dimRatings: [
      { name: "Scenery", score: 5 },
      { name: "Difficulty", score: 5 },
      { name: "Views", score: 5 },
    ],
    notes: "Heart-pounding finale with chains. Worth every step. Permit required.",
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 47,
  },
];

export function HikesProvider({ children }: { children: React.ReactNode }) {
  const [hikes, setHikes] = useState<HikeEntry[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const likes = await AsyncStorage.getItem(LIKES_KEY);
        if (stored) {
          setHikes(JSON.parse(stored));
        } else {
          setHikes(SEED_HIKES);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_HIKES));
        }
        if (likes) {
          setLikedIds(new Set(JSON.parse(likes)));
        }
      } catch {
        setHikes(SEED_HIKES);
      }
    })();
  }, []);

  const addHike = useCallback(
    async (hikeData: Omit<HikeEntry, "id" | "date" | "likes">) => {
      const newHike: HikeEntry = {
        ...hikeData,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        date: new Date().toISOString(),
        likes: 0,
      };
      const updated = [newHike, ...hikes];
      setHikes(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },
    [hikes]
  );

  const toggleLike = useCallback(
    async (id: string) => {
      const next = new Set(likedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setLikedIds(next);
      await AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next]));
    },
    [likedIds]
  );

  return (
    <HikesContext.Provider value={{ hikes, addHike, likedIds, toggleLike }}>
      {children}
    </HikesContext.Provider>
  );
}

export function useHikes() {
  const ctx = useContext(HikesContext);
  if (!ctx) throw new Error("useHikes must be used within HikesProvider");
  return ctx;
}
