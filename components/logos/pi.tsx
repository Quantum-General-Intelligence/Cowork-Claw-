import * as React from 'react'
import type { SVGProps } from 'react'

const Pi = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M6 8h12M9 8v10M15 8v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

export default Pi
