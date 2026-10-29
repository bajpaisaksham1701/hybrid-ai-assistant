import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Plus, Send, X, FileText, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './index.css'

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [activeFile, setActiveFile] = useState(null)
  const [collectionId, setCollectionId] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const storedSession = sessionStorage.getItem('chat_session_id')
    if (storedSession) {
      setSessionId(storedSession)
    } else {
      const newSession = crypto.randomUUID()
      sessionStorage.setItem('chat_session_id', newSession)
      setSessionId(newSession)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsUploading(true)
    setActiveFile(file.name)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post('https://rag-backend-c1vp.onrender.com/upload', formData)
      setCollectionId(response.data.collection_id)
    } catch (error) {
      console.error("Upload failed", error)
      setActiveFile(null)
    } finally {
      setIsUploading(false)
    }
  }

  const removeFile = () => {
    setActiveFile(null)
    setCollectionId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const response = await axios.post('https://rag-backend-c1vp.onrender.com/chat', {
        session_id: sessionId,
        message: userMsg.content,
        collection_id: collectionId
      })
      setMessages(prev => [...prev, { role: 'ai', content: response.data.response }])
    } catch (error) {
      console.error("Chat failed", error)
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="app-container">
      <div className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">How can I help you today?</div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.role === 'ai' ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '')
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {isTyping && <div className="message ai typing">...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        {activeFile && (
          <div className="file-chip">
            <FileText size={14} />
            <span>{activeFile}</span>
            {isUploading ? <Loader2 size={14} className="spin" /> : <X size={14} className="close" onClick={removeFile} />}
          </div>
        )}
        <form onSubmit={sendMessage} className="input-form">
          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button type="button" className="icon-btn" onClick={() => fileInputRef.current.click()}>
            <Plus size={24} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message AI..."
            className="text-input"
          />
          <button type="submit" className="icon-btn send" disabled={isUploading || !input.trim()}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  )
}