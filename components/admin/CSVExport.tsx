'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import dayjs from 'dayjs'

interface CSVExportProps {
  type: 'timeclock' | 'schedule';
  dateFrom?: string;
  dateTo?: string;
}

export function CSVExport({ type, dateFrom, dateTo }: CSVExportProps) {
  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)

      const res = await fetch(`/api/export/csv?type=${type}&${params.toString()}`)
      
      if (!res.ok) {
        throw new Error('Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
      alert('エクスポートに失敗しました')
    }
  }

  const label = type === 'timeclock' ? '打刻記録' : 'シフト申請'

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-4">{label} CSV エクスポート</h3>
      <p className="text-sm text-gray-600 mb-4">
        {label}をCSV形式でダウンロードできます
      </p>
      <Button
        onClick={handleExport}
        className="bg-purple-600 hover:bg-purple-700"
      >
        💾 {label} をダウンロード
      </Button>
    </Card>
  )
}
