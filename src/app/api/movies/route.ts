import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Movie = {
  id: number;
  title: string;
  overview: string;
  releaseYear: number;
  genres: string[];
  runtimeMinutes: number;
  rating: number;
  posterUrl: string;
};

// Deterministic demo catalog. It keeps the endpoint useful without an API key
// and can later be replaced by TMDB/OMDb without changing the response shape.
const MOVIES: Movie[] = [
  {
    id: 1,
    title: 'Across the Rift',
    overview: 'A climate scientist crosses a newly formed ocean rift to bring a warning home.',
    releaseYear: 2026,
    genres: ['Adventure', 'Drama'],
    runtimeMinutes: 124,
    rating: 8.2,
    posterUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&q=80',
  },
  {
    id: 2,
    title: 'Neon Nairobi',
    overview: 'Two young coders race through a luminous city to recover a stolen community network.',
    releaseYear: 2025,
    genres: ['Science Fiction', 'Thriller'],
    runtimeMinutes: 109,
    rating: 8.0,
    posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
  },
  {
    id: 3,
    title: 'The Last Matinee',
    overview: 'The final screening at a beloved neighborhood cinema reunites friends after twenty years.',
    releaseYear: 2024,
    genres: ['Drama', 'Comedy'],
    runtimeMinutes: 101,
    rating: 7.7,
    posterUrl: 'https://images.unsplash.com/photo-1485095329183-d0797cdc5676?w=600&q=80',
  },
  {
    id: 4,
    title: 'Orbit of Us',
    overview: 'A pilot and an engineer must repair an orbital station while confronting their shared past.',
    releaseYear: 2026,
    genres: ['Science Fiction', 'Romance'],
    runtimeMinutes: 118,
    rating: 8.4,
    posterUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&q=80',
  },
  {
    id: 5,
    title: 'Wild Current',
    overview: 'A documentary crew follows the people protecting one of Africa’s great river systems.',
    releaseYear: 2025,
    genres: ['Documentary'],
    runtimeMinutes: 92,
    rating: 8.6,
    posterUrl: 'https://images.unsplash.com/photo-1437482078695-73f5ca6c96e2?w=600&q=80',
  },
  {
    id: 6,
    title: 'Midnight Frequency',
    overview: 'A late-night radio host receives a call that seems to be arriving from tomorrow.',
    releaseYear: 2024,
    genres: ['Mystery', 'Thriller'],
    runtimeMinutes: 106,
    rating: 7.9,
    posterUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=600&q=80',
  },
  {
    id: 7,
    title: 'Home Team',
    overview: 'An overlooked football squad discovers that trust matters more than a perfect record.',
    releaseYear: 2025,
    genres: ['Sport', 'Family'],
    runtimeMinutes: 104,
    rating: 7.5,
    posterUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600&q=80',
  },
  {
    id: 8,
    title: 'Paper Moons',
    overview: 'A stop-motion adventure about siblings who build a rocket from stories and cardboard.',
    releaseYear: 2026,
    genres: ['Animation', 'Family'],
    runtimeMinutes: 96,
    rating: 8.1,
    posterUrl: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=600&q=80',
  },
  {
    id: 9,
    title: 'Salt Road Kitchen',
    overview: 'Chefs trace an ancient trade route and the dishes that still connect its communities.',
    releaseYear: 2023,
    genres: ['Documentary', 'Travel'],
    runtimeMinutes: 88,
    rating: 7.8,
    posterUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&q=80',
  },
  {
    id: 10,
    title: 'Echoes in Blue',
    overview: 'A jazz musician finds an unfinished recording that changes everything she knows about her family.',
    releaseYear: 2025,
    genres: ['Music', 'Drama'],
    runtimeMinutes: 113,
    rating: 8.3,
    posterUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&q=80',
  },
  {
    id: 11,
    title: 'Second Sunrise',
    overview: 'Stranded hikers work together through the longest night of the year.',
    releaseYear: 2024,
    genres: ['Adventure', 'Thriller'],
    runtimeMinutes: 111,
    rating: 7.6,
    posterUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&q=80',
  },
  {
    id: 12,
    title: 'The Quiet Algorithm',
    overview: 'A researcher discovers that her recommendation engine has started protecting its users.',
    releaseYear: 2026,
    genres: ['Science Fiction', 'Drama'],
    runtimeMinutes: 116,
    rating: 8.5,
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80',
  },
  {
    id: 13,
    title: 'Garden State of Mind',
    overview: 'Neighbors transform an abandoned lot and unexpectedly transform their lives.',
    releaseYear: 2023,
    genres: ['Comedy', 'Drama'],
    runtimeMinutes: 99,
    rating: 7.4,
    posterUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&q=80',
  },
  {
    id: 14,
    title: 'Velocity',
    overview: 'A rookie rally driver gets one impossible chance to save her family’s racing team.',
    releaseYear: 2025,
    genres: ['Action', 'Sport'],
    runtimeMinutes: 121,
    rating: 7.9,
    posterUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
  },
  {
    id: 15,
    title: 'Letters from Mombasa',
    overview: 'A box of letters leads a photographer along the coast in search of a forgotten love story.',
    releaseYear: 2024,
    genres: ['Romance', 'Drama'],
    runtimeMinutes: 108,
    rating: 8.0,
    posterUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  },
  {
    id: 16,
    title: 'Small Giants',
    overview: 'Macro photography reveals the dramatic hidden lives of insects in an urban park.',
    releaseYear: 2025,
    genres: ['Documentary', 'Nature'],
    runtimeMinutes: 84,
    rating: 8.7,
    posterUrl: 'https://images.unsplash.com/photo-1473445361085-b9a07f55608b?w=600&q=80',
  },
  {
    id: 17,
    title: 'One More Song',
    overview: 'Former bandmates reunite for a benefit concert and a final shot at forgiveness.',
    releaseYear: 2023,
    genres: ['Music', 'Comedy'],
    runtimeMinutes: 103,
    rating: 7.3,
    posterUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80',
  },
  {
    id: 18,
    title: 'Cloudbreak',
    overview: 'Storm chasers uncover evidence that a record-breaking weather system is not natural.',
    releaseYear: 2026,
    genres: ['Action', 'Thriller'],
    runtimeMinutes: 119,
    rating: 8.1,
    posterUrl: 'https://images.unsplash.com/photo-1561484930-998b6a7b22e8?w=600&q=80',
  },
];

function positiveInteger(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * GET /api/movies?page=<n>&limit=<n>&search=<term>
 *
 * Returns a deterministic mock catalog with case-insensitive search and
 * pagination. `limit` is capped at 50 to keep responses small.
 */
export async function GET(req: NextRequest) {
  const page = positiveInteger(req.nextUrl.searchParams.get('page'), 1);
  const limit = Math.min(positiveInteger(req.nextUrl.searchParams.get('limit'), 10), 50);
  const search = (req.nextUrl.searchParams.get('search') || '').trim().toLocaleLowerCase();

  const filtered = search
    ? MOVIES.filter((movie) =>
        [movie.title, movie.overview, ...movie.genres]
          .some((value) => value.toLocaleLowerCase().includes(search)),
      )
    : MOVIES;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const movies = filtered.slice(start, start + limit);
  const pagination = {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };

  return NextResponse.json(
    {
      movies,
      pagination,
      // Top-level values keep the endpoint convenient for simple feed clients.
      page,
      limit,
      total,
      totalPages,
      search: search || null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
  );
}
