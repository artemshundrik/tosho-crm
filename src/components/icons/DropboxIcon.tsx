// Official Dropbox brand mark: the white Dropbox logo on the Dropbox-blue
// rounded badge. The logo uses the canonical Dropbox glyph (its own 528x512
// viewBox), nested and auto-centred inside the badge so it stays crisp and
// undistorted at any size. Self-contained — render with just a className like
// "h-5 w-5", no wrapper background needed.
export function DropboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="5.3" fill="#0061FF" />
      <svg x="4.5" y="6" width="15" height="12" viewBox="0 0 528 512" preserveAspectRatio="xMidYMid meet">
        <path
          fill="#ffffff"
          d="M264.4 116.3l-132 84.3 132 84.3-132 84.3L0 284.1l132.3-84.3L0 116.3 132.3 32l132.1 84.3zM131.6 395.7l132-84.3 132 84.3-132 84.3-132-84.3zm132.8-111.6l132-84.3-132-83.6L395.7 32 528 116.3l-132.3 84.3L528 284.8l-132.3 84.3-131.3-85z"
        />
      </svg>
    </svg>
  );
}

export default DropboxIcon;
