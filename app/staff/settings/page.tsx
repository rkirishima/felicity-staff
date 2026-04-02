'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

function PinInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-stone-400 mb-2">{label}</p>
      <div className="flex gap-3 justify-center mb-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${
            value.length > i ? (error ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'
          }`} />
        ))}
      </div>
    </div>
  )
}

function SettingsContent() {
  const router = useRouter()
  const [staffList, setStaffList] = useState<any[]>([])
  const [staffId, setStaffId] = useState('')
  const [step, setStep] = useState<'select' | 'current' | 'new' | 'confirm'>('select')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('staff').select('id, name').eq('active', true)
      .not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList(data ?? []))
  }, [])

  function handleKey(n: string, current: string, setter: (v: string) => void, onComplete: (v: string) => void) {
    setError(false)
    if (n === '⌫') { setter(current.slice(0,-1)); return }
    const next = current + n
    setter(next)
    if (next.length === 4) onComplete(next)
  }

  async function verifyCurrentPin(pin: string) {
    const { data } = await supabase.from('staff').select('pin').eq('id', staffId).single()
    if (pin !== (data?.pin || '1234')) {
      setError(true)
      setTimeout(() => { setCurrentPin(''); setError(false) }, 600)
      toast.error('現在のPINが違います')
    } else {
      setStep('new')
    }
  }

  function verifyNewPin(pin: string) {
    setStep('confirm')
  }

  async function verifyConfirmPin(pin: string) {
    if (pin !== newPin) {
      setError(true)
      setTimeout(() => { setConfirmPin(''); setError(false) }, 600)
      toast.error('PINが一致しません')
      return
    }
    setLoading(true)
    await supabase.from('staff').update({ pin: newPin }).eq('id', staffId)
    toast.success('PINを変更しました！')
    setLoading(false)
    router.back()
  }

  const activePin = step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin
  const activeSetter = step === 'current' ? setCurrentPin : step === 'new' ? setNewPin : setConfirmPin
  const onComplete = step === 'current' ? verifyCurrentPin : step === 'new' ? verifyNewPin : verifyConfirmPin

  const stepLabel = {
    current: '現在のPIN',
    new: '新しいPIN（4桁）',
    confirm: '新しいPINを確認'
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-widest text-stone-800">PIN変更</h1>
      </div>

      {step === 'select' ? (
        <div className="w-full max-w-xs space-y-3">
          <p className="text-xs text-stone-400 text-center">スタッフを選んでください</p>
          {staffList.map(s => (
            <button key={s.id} onClick={() => { setStaffId(s.id); setStep('current') }}
              className="w-full py-3 bg-white rounded-2xl shadow-sm text-stone-700 font-medium">
              {s.name}
            </button>
          ))}
          <button onClick={() => router.back()} className="w-full text-stone-400 text-xs text-center mt-2">
            ← 戻る
          </button>
        </div>
      ) : (
        <>
          <PinInput label={stepLabel[step]} value={activePin} error={error} onChange={() => {}} />

          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
              <button key={i}
                onClick={() => n !== '' && handleKey(n, activePin, activeSetter, onComplete)}
                disabled={loading}
                className={`py-4 rounded-2xl text-xl font-medium transition-all ${
                  n === '' ? '' : 'bg-white text-stone-700 shadow-sm active:scale-95'
                }`}>{n}</button>
            ))}
          </div>

          <button onClick={() => { setStep('select'); setCurrentPin(''); setNewPin(''); setConfirmPin('') }}
            className="text-stone-400 text-xs">← 戻る</button>
        </>
      )}
    </main>
  )
}

export default function SettingsPage() {
  return <Suspense><SettingsContent /></Suspense>
}
