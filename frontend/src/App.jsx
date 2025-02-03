import useWebSocket from "react-use-websocket";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Mic, MicOff } from "lucide-react";

const WS_URL = "ws://localhost:8000";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const bufferRef = useRef("");

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setTranscript(transcript);
        setInput(transcript); // Set the transcript as input
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
      };
    } else {
      console.warn("Speech recognition not supported in this browser.");
    }
  }, []);

  // Start/stop recording
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setTranscript("");
      recognitionRef.current.start();
    }
    setIsRecording(!isRecording);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleError = () => {
    setLoading(false);
    setMessages(prev => [
      ...prev,
      { role: "bot", content: "An error occurred. Please try again.", type: "text" }
    ]);
  };

  const { sendMessage } = useWebSocket(WS_URL, {
    onOpen: () => console.log("WebSocket Connected"),
    onMessage: (event) => {
      const chunk = event.data;
      if (chunk === "END") return setLoading(false);
      if (chunk === "ERROR") return handleError();
      
      bufferRef.current += chunk;
      processBuffer();
    },
    onError: (error) => console.error("WebSocket error:", error),
    onClose: () => console.log("WebSocket disconnected"),
  });

  const processBuffer = () => {
    const buffer = bufferRef.current;
    const parts = buffer.split("```");
    const hasUnclosedCodeBlock = parts.length % 2 === 0;

    // Process complete pairs only
    const processableLength = hasUnclosedCodeBlock ? parts.length - 1 : parts.length;

    for (let i = 0; i < processableLength; i++) {
      const part = parts[i];
      if (i % 2 === 0) { // Text part
        if (part.trim()) {
          setMessages(prev => updateLastMessage(prev, part, "text"));
        }
      } else { // Code part
        const [language, ...code] = part.split("\n");
        const codeContent = code.join("\n").trim();
        setMessages(prev => [
          ...prev,
          { 
            role: "bot", 
            content: codeContent, 
            type: "code", 
            language: (language || "javascript").trim() || "javascript"
          }
        ]);
      }
    }

    // Preserve unclosed code blocks for next chunk
    bufferRef.current = hasUnclosedCodeBlock 
      ? "```" + parts.slice(processableLength).join("```")
      : "";
  };

  const updateLastMessage = (prevMessages, content, type) => {
    const lastMessage = prevMessages[prevMessages.length - 1];
    
    // Only append if last message is same type
    if (!lastMessage || lastMessage.role !== "bot" || lastMessage.type !== type) {
      return [...prevMessages, { role: "bot", content, type }];
    }
    
    return prevMessages.map((msg, i) =>
      i === prevMessages.length - 1 ? { ...msg, content: msg.content + content } : msg
    );
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: "user", content: input, type: "text" }]);
    sendMessage(input);
    setInput("");
    setTranscript(""); // Clear transcript after sending
  };

  return (
    <div className="w-full h-screen bg-gradient-to-r from-red-100 to-blue-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl py-2 antialiased font-semibold tracking-widest text-gradient-r from-yellow-100 to-green-800 border-b-2 mb-4">Text based Streaming App</h1>
      <div className="w-full max-w-3xl p-1 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex flex-col h-[90vh]">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === "user" 
                  ? "bg-blue-600 text-white" 
                  : "bg-gray-50 text-black"
              }`}>
                {msg.type === "code" ? (
                  <div className="overflow-x-auto text-sm bg-gray-800 rounded-lg">
                    <SyntaxHighlighter 
                      style={oneDark}
                      language={msg.language}
                      PreTag="div"
                      className="rounded-md"
                      customStyle={{
                        margin: 0,
                        backgroundColor: 'inherit',
                        padding: '0.5rem',
                      }}
                    >
                      {msg.content}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="prose text-inherit break-words"
                    components={{
                      p: ({ ...props}) => <p className="mb-2" {...props} />
                    }}
                  >
                    {msg.content.replace(/```/g, '')}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200/50 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isRecording ? "Listening..." : "Type your message..."}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/90 backdrop-blur-sm"
              disabled={loading || isRecording}
            />
            
            <button
              onClick={toggleRecording}
              className={`p-2 rounded-lg transition-all ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {isRecording ? (
                <MicOff className="h-5 w-5 text-white" />
              ) : (
                <Mic className="h-5 w-5 text-gray-600" />
              )}
            </button>
            
            <button
              onClick={handleSend}
              disabled={loading || isRecording}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
          {transcript && (
            <div className="mt-2 text-sm text-gray-600">
              <strong>Transcript:</strong> {transcript}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}