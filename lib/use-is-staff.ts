'use client'

import { useSyncExternalStore } from 'react'
import { getSession } from './session'

// localStorage は SSR には存在しないので、サーバースナップショットは常に false。
// useEffect + setState でやると「effect 内の同期 setState」になり
// (react-hooks/set-state-in-effect)、hydration 後に余計な再レンダリングも挟む。
// スナップショットが boolean なので getSnapshot が毎回同じ値を返し、ループしない。
const subscribe = () => () => {}
const getSnapshot = () => !!getSession()
const getServerSnapshot = () => false

/** スタッフセッション(felicity_session)でログインしているか。 */
export function useIsStaff(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
