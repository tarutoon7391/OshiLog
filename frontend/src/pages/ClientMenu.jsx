import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Card, PrimaryButton, inputClass } from '../components/ui'

// クライアント専用メニュー。中心は「推しログについて何でも答えるサイト案内AI」（質問制限なし）。
const GREETING = { role: 'assistant', content: 'こんにちは！「推しログ」のガイドAIです🌸\nこのアプリの使い方や機能について、何でも聞いてください。\n（例：「推し友はどうやって作るの？」「会場の地図はどこで見られる？」「管理者は何ができる？」）' }
const SUGGESTIONS = ['このアプリで何ができる？', '推し友の作り方は？', 'イベントの会場の地図はどこ？', '貯金機能について教えて', '管理者は何ができる？']

export default function ClientMenu() {
  const [messages, setMessages] = useState([GREETING])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  const ask = async (q) => {
    const content = (q ?? text).trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next); setText(''); setBusy(true)
    try {
      const r = await api('/assistant/site', { method: 'POST', body: { messages: next } })
      setMessages((prev) => [...prev, { role: 'assistant', content: r.reply }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'すみません、うまく応答できませんでした。少し時間をおいて試してください。' }])
    } finally { setBusy(false) }
  }

  const onSubmit = (e) => { e.preventDefault(); ask() }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-wine">推しログ ガイド</h2>
        <p className="text-[11px] text-ink-soft mt-0.5">このアプリの使い方や機能について、何でも聞けるAIです（質問回数の制限なし）。</p>
      </div>

      {/* チャット表示 */}
      <Card className="p-0 overflow-hidden">
        <div className="bg-wine text-white px-3 py-2 text-sm font-bold flex items-center gap-2">🤖 推しログ ガイドAI</div>
        <div className="p-3 space-y-2.5 max-h-[52vh] overflow-y-auto scroll-area">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-wine text-white' : 'bg-paper border border-paper-line text-ink'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-paper border border-paper-line rounded-2xl px-3 py-2 text-sm text-ink-soft">考え中…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </Card>

      {/* 質問の例（タップで送信） */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => ask(s)} disabled={busy}
            className="text-[11px] text-wine border border-wine/40 rounded-full px-2.5 py-1 disabled:opacity-50">{s}</button>
        ))}
      </div>

      {/* 入力 */}
      <form onSubmit={onSubmit} className="flex gap-2 items-end">
        <textarea rows={1} value={text} maxLength={500}
          className={inputClass + ' resize-none flex-1'} placeholder="質問を入力…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} />
        <PrimaryButton disabled={busy || !text.trim()}>送信</PrimaryButton>
      </form>
    </div>
  )
}
