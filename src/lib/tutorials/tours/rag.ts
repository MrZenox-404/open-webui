import type { Tutorial } from '../types';
import { showSidebar } from '$lib/stores';

export const ragTour: Tutorial = {
	id: 'rag',
	title: 'Chat with your documents (RAG)',
	steps: [
		{
			id: 'welcome',
			placement: 'center',
			title: 'Welcome aboard!',
			body: "So glad you're here! Let's take a quick spin through the app together — I'll highlight things as we go, and by the end you'll be chatting with your very own documents. It only takes a minute. Ready? Let's go!",
			advance: { type: 'manual' }
		},
		{
			id: 'model-selector',
			anchor: 'model-selector',
			placement: 'bottom',
			title: 'Meet your AI',
			body: "First up — this is where you choose your AI model. Think of it as picking who you'd like to chat with; each model has its own strengths. Tap it anytime to switch things up.",
			advance: { type: 'manual' }
		},
		{
			id: 'message-input',
			anchor: '#chat-input-container',
			placement: 'top',
			title: 'This is where it all happens',
			body: "Your message box! Type anything here and hit send. Very soon you'll be dropping in your own knowledge and asking real questions about it — that's where the magic kicks in.",
			advance: { type: 'manual' }
		},
		{
			id: 'open-workspace',
			anchor: '#sidebar-workspace-button',
			placement: 'right',
			title: "Let's give the AI some reading",
			body: 'Here comes the fun part — teaching the AI from your own documents. Click “Workspace” in the sidebar and let’s set it up together.',
			advance: { type: 'route', match: '^/workspace' },
			onEnter: () => showSidebar.set(true)
		},
		{
			id: 'knowledge-tab',
			anchor: 'kb-tab',
			placement: 'bottom',
			title: 'Into the library',
			body: 'Almost there! Open the “Knowledge” tab — this is your shelf of documents the AI can pull answers from.',
			advance: { type: 'route', match: '^/workspace/knowledge' }
		},
		{
			id: 'new-knowledge',
			anchor: 'kb-new',
			placement: 'left',
			title: 'Start a fresh one',
			body: 'Hit “New Knowledge” to create your very first knowledge base. Think of it as a smart folder the AI can read from.',
			advance: { type: 'route', match: '^/workspace/knowledge/create' }
		},
		{
			id: 'name-knowledge',
			anchor: 'kb-name',
			placement: 'bottom',
			title: 'Give it a name',
			body: "Pick a name you'll recognise later — something like “My Docs” works perfectly.",
			advance: { type: 'manual' }
		},
		{
			id: 'describe-knowledge',
			anchor: 'kb-description',
			placement: 'top',
			title: 'Say what it’s about',
			body: "Add a short description of what's inside. It helps the AI understand your collection — and helps future-you remember what this is.",
			advance: { type: 'manual' },
			optional: true
		},
		{
			id: 'access-knowledge',
			anchor: 'kb-access',
			placement: 'top',
			title: 'Who can see it?',
			body: 'Keep it private to just you, or share it with your team. Private is a great default — you can always change this later.',
			advance: { type: 'manual' },
			optional: true
		},
		{
			id: 'create-knowledge',
			anchor: 'kb-create',
			placement: 'left',
			title: 'Bring it to life',
			body: "All set? Hit “Create Knowledge” and we'll spin up your collection.",
			advance: { type: 'route', match: '^/workspace/knowledge/(?!create$)[^/]+$' }
		},
		{
			id: 'add-content',
			anchor: 'kb-add-content',
			placement: 'bottom',
			title: 'Now feed it a document',
			body: 'This is the heart of it — adding your own files. Click the “+” button to add content. A PDF works great, since you’ll get page numbers and passages later on.',
			advance: { type: 'click' }
		},
		{
			id: 'upload-files',
			anchor: 'kb-upload-files',
			placement: 'left',
			title: 'Upload a file',
			body: 'Choose “Upload files”, then pick a document from your computer.',
			advance: { type: 'click' }
		},
		{
			id: 'processing',
			anchor: 'kb-files-panel',
			placement: 'right',
			title: 'Reading your document…',
			body: "Your file lands right here, and we're turning it into something the AI can search. This usually takes just a few seconds.",
			loading: true,
			tips: [
				'Tip: you can also drag & drop files straight into this panel.',
				'Tip: watch the top-right corner for a success notification.'
			],
			advance: { type: 'signal', name: 'kb.file.processed' }
		},
		{
			id: 'back-to-chat',
			anchor: 'new-chat',
			placement: 'right',
			title: 'Back to the conversation',
			body: "Your knowledge base is ready! Let's head back and put it to work. Click “New Chat” to start a fresh conversation.",
			advance: { type: 'route', match: '^/($|c/)' },
			onEnter: () => showSidebar.set(true)
		},
		{
			id: 'attach-knowledge',
			anchor: '#chat-input-container',
			placement: 'bottom',
			padding: { top: 300, left: 16, right: 16, bottom: 20 },
			title: 'First, bring in your knowledge',
			body: "Type “#” in the message box — your knowledge bases pop up just above. Pick the one you just created to attach it to this chat.",
			advance: { type: 'signal', name: 'chat.kb.attached' }
		},
		{
			id: 'type-question',
			anchor: '#chat-input-container',
			placement: 'bottom',
			padding: { left: 16, right: 16, bottom: 20 },
			title: 'Now ask your question',
			body: "Type a real question about your document right here — something you'd genuinely like to know. Then hit Next.",
			advance: { type: 'manual' }
		},
		{
			id: 'send-question',
			anchor: '#send-message-button',
			placement: 'left',
			title: 'Send it off',
			body: 'Hit the send button and the AI will answer your question using your document.',
			advance: { type: 'signal', name: 'chat.submitted' }
		},
		{
			id: 'generating',
			anchor: '#chat-pane',
			placement: 'right',
			title: 'Thinking it through…',
			body: 'The model is now reading your document from the knowledge base and writing an answer grounded in it. When it finishes, we’ll look at where the answer came from.',
			loading: true,
			tips: [
				'The answer uses only what the AI found in your document.',
				'Almost there — the sources will appear right under the reply.'
			],
			advance: { type: 'element', anchor: 'citations-toggle' }
		},
		{
			id: 'sources-toggle',
			anchor: 'citations-toggle',
			placement: 'top',
			title: 'See where it came from',
			body: 'Notice the answer is backed by your document? Click the “Sources” line just below the reply to reveal exactly what the AI drew from.',
			advance: { type: 'click' }
		},
		{
			id: 'open-citation',
			anchor: 'citation-item',
			placement: 'top',
			title: 'Peek inside a source',
			body: 'Click any source in the list to open it up and see the details behind the answer.',
			advance: { type: 'click' }
		},
		{
			id: 'citation-file',
			anchor: 'citation-file-link',
			placement: 'bottom',
			title: 'Straight to the original',
			body: 'This link opens the original document — and jumps right to the exact page the answer came from. Perfect for double-checking.',
			advance: { type: 'manual' }
		},
		{
			id: 'citation-relevance',
			anchor: 'citation-relevance',
			placement: 'bottom',
			title: 'How strong is the match?',
			body: 'This percentage shows how closely the passage matches your question — higher means a better match. The colour gives you a quick read at a glance: green is great, red is weak.',
			advance: { type: 'manual' },
			optional: true
		},
		{
			id: 'citation-page',
			anchor: 'citation-page',
			placement: 'bottom',
			title: 'Find it on the page',
			body: "And here's the exact page number the passage was found on, so you can locate it in the original file.",
			advance: { type: 'manual' },
			optional: true
		},
		{
			id: 'citation-excerpt',
			anchor: 'citation-excerpt',
			placement: 'top',
			title: 'The exact passage',
			body: "This is the real text the AI pulled from your document to build its answer — no guessing, no making things up. That's RAG in a nutshell.",
			advance: { type: 'manual' }
		},
		{
			id: 'finish',
			placement: 'center',
			title: "And that's a wrap!",
			body: "You just built a knowledge base, fed it a document, and got answers grounded in your own content — complete with sources you can verify. You're all set. Happy exploring!",
			advance: { type: 'manual' }
		}
	]
};
