import os
import uuid
import shutil
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_groq import ChatGroq
from dotenv import load_dotenv
from rag import process_document, query_rag

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Using the active free-tier model
llm = ChatGroq(model_name="openai/gpt-oss-20b")

SESSION_STORE: Dict[str, List[Any]] = {}
WINDOW_LIMIT = 10

class ChatRequest(BaseModel):
    session_id: str
    message: str
    collection_id: Optional[str] = None

def summarize_conversation(messages: List[Any]) -> str:
    conversation_text = "\n".join([f"{type(m).__name__}: {m.content}" for m in messages])
    prompt = f"Summarize this conversation briefly to retain context for future interactions:\n\n{conversation_text}"
    response = llm.invoke(prompt)
    return response.content

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    collection_id = str(uuid.uuid4())
    file_path = f"temp_{collection_id}.pdf"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        process_document(file_path, collection_id)
        os.remove(file_path)
        return {"collection_id": collection_id, "filename": file.filename}
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    # 1. Initialize empty history (NO default system message here)
    if request.session_id not in SESSION_STORE:
        SESSION_STORE[request.session_id] = []
        
    history = SESSION_STORE[request.session_id]
    
    # 2. Check window limit BEFORE adding the new message
    if len(history) >= WINDOW_LIMIT:
        summary_text = summarize_conversation(history)
        history.clear()
        # Merge summary into the current user query to prevent role-sequence crashing
        request.message = f"[Context from previous chat: {summary_text}]\n\n{request.message}"
        
    # 3. Snapshot the history for the RAG prompt (excluding the current message)
    current_history = history.copy()
    
    # 4. Now append the new message to the persistent store
    history.append(HumanMessage(content=request.message))
    
    # 5. Route the query
    if request.collection_id:
        # RAG pipeline dynamically handles the system context internally
        response_text = query_rag(request.message, request.collection_id, current_history)
    else:
        # Normal chat pipeline dynamically prepends the system context
        messages = [SystemMessage(content="You are a helpful AI assistant.")] + history
        response = llm.invoke(messages)
        response_text = response.content
        
    # 6. Store AI response
    history.append(AIMessage(content=response_text))
    
    return {"response": response_text}