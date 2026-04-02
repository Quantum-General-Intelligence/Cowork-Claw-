import * as React from 'react'
import type { SVGProps } from 'react'

const OpenClaw = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 9.5C8 9.5 9 7 12 7s4 2.5 4 2.5M7 14s1.5 3 5 3 5-3 5-3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="9.5" cy="11" r="1" fill="currentColor" />
    <circle cx="14.5" cy="11" r="1" fill="currentColor" />
    <path
      d="M6 6L4.5 4.5M18 6l1.5-1.5M6 18l-1.5 1.5M18 18l1.5 1.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
)

export default OpenClaw
