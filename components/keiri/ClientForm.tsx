'use client'

import { useState, type ReactNode } from 'react'
import type { ClientInput } from '@/app/admin/keiri/clients/actions'

const inputCls =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}

export type ClientFormValues = ClientInput

const empty: ClientFormValues = {
  name: '',
  name_kana: '',
  registration_number: '',
  postal_code: '',
  address: '',
  contact_person: '',
  email: '',
  phone: '',
  payment_terms: '',
  notes: '',
}

export function emptyClient(): ClientFormValues {
  return { ...empty }
}

function clean(v: string | null): string | null {
  if (v == null) return null
  const s = v.trim()
  return s ? s : null
}

export function normalizeClient(v: ClientFormValues): ClientInput {
  return {
    name: v.name.trim(),
    name_kana: clean(v.name_kana),
    registration_number: clean(v.registration_number),
    postal_code: clean(v.postal_code),
    address: clean(v.address),
    contact_person: clean(v.contact_person),
    email: clean(v.email),
    phone: clean(v.phone),
    payment_terms: clean(v.payment_terms),
    notes: clean(v.notes),
  }
}

export function ClientForm({
  initial,
  onSave,
  saving,
  saveLabel,
}: {
  initial: ClientFormValues
  onSave: (v: ClientInput) => Promise<void> | void
  saving: boolean
  saveLabel: string
}) {
  const [v, setV] = useState<ClientFormValues>(initial)

  function up<K extends keyof ClientFormValues>(k: K, val: ClientFormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <Field label="取引先名 *">
          <input value={v.name} onChange={e => up('name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="カナ">
          <input value={v.name_kana ?? ''} onChange={e => up('name_kana', e.target.value)} className={inputCls} />
        </Field>
        <Field label="登録番号 (T+13桁)">
          <input
            value={v.registration_number ?? ''}
            onChange={e => up('registration_number', e.target.value)}
            className={inputCls}
            placeholder="例: T1234567890123"
          />
        </Field>
        <Field label="郵便番号">
          <input value={v.postal_code ?? ''} onChange={e => up('postal_code', e.target.value)} className={inputCls} />
        </Field>
        <Field label="住所">
          <input value={v.address ?? ''} onChange={e => up('address', e.target.value)} className={inputCls} />
        </Field>
        <Field label="担当者">
          <input
            value={v.contact_person ?? ''}
            onChange={e => up('contact_person', e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="メール">
            <input value={v.email ?? ''} onChange={e => up('email', e.target.value)} className={inputCls} />
          </Field>
          <Field label="電話">
            <input value={v.phone ?? ''} onChange={e => up('phone', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="支払条件">
          <input
            value={v.payment_terms ?? ''}
            onChange={e => up('payment_terms', e.target.value)}
            className={inputCls}
            placeholder="例: 月末締め翌月末払い"
          />
        </Field>
        <Field label="備考">
          <textarea
            value={v.notes ?? ''}
            onChange={e => up('notes', e.target.value)}
            className={inputCls}
            rows={2}
          />
        </Field>
      </div>

      <button
        onClick={() => onSave(normalizeClient(v))}
        disabled={saving}
        className="w-full bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
      >
        {saving ? '保存中...' : saveLabel}
      </button>
    </div>
  )
}
