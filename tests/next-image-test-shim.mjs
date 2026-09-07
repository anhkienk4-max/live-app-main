import * as React from 'react'

export default function Image({ src, alt, unoptimized: _unoptimized, ...props }) {
  void _unoptimized
  return React.createElement('img', { ...props, src: String(src), alt })
}
