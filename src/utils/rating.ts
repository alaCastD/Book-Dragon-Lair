/**
 * What the rating becomes when a star is tapped. Tapping the star that
 * matches the current rating clears it, so a rating can be removed.
 */
export function nextRating(current: number, tapped: number): number {
  return tapped === current ? 0 : tapped;
}

/** Screen-reader text for a rating. */
export function ratingLabel(rating: number): string {
  if (rating === 0) return 'Not rated';
  return `${rating} out of 5 stars`;
}
