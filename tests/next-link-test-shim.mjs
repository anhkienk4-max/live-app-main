import * as React from 'react'

export default function Link({ href, children, ...props }) {
  const resolvedHref = typeof href === 'string' ? href : href?.pathname || ''
  return React.createElement('a', { ...props, href: resolvedHref }, children)
}
