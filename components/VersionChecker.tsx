'use client'

const APP_VERSION = '1.7.0'

export function VersionChecker() {
  return (
    <span className="text-xs text-gray-400 select-none">v{APP_VERSION}</span>
  )
}
