document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const suggestionsBox = document.getElementById('suggestions-box');
  const newWordInput = document.getElementById('new-word-input');
  const addWordBtn = document.getElementById('add-word-btn');
  const feedbackMsg = document.getElementById('feedback-msg');
  const loader = document.getElementById('loader');

  const TOP_K = 7;
  const N_GRAM_SIZE = 2;

  // --- DATA STRUCTURES ---
  class TrieNode {
    constructor() {
      this.children = {};
      this.isEndOfWord = false;
      this.count = 0;
    }
  }
  class Trie {
    constructor() {
      this.root = new TrieNode();
    }
    insert(word) {
      let node = this.root;
      word = word.toLowerCase();
      for (const char of word) {
        if (!node.children[char]) node.children[char] = new TrieNode();
        node = node.children[char];
      }
      node.isEndOfWord = true;
      node.count++;
    }
    findNode(prefix) {
      let node = this.root;
      prefix = prefix.toLowerCase();
      for (const char of prefix) {
        if (node.children[char]) node = node.children[char];
        else return null;
      }
      return node;
    }
    findAllWords(node, prefix) {
      let words = [];
      if (node.isEndOfWord) words.push({ word: prefix, count: node.count });
      for (const char in node.children) {
        words.push(...this.findAllWords(node.children[char], prefix + char));
      }
      return words;
    }
  }
  class MinHeap {
    constructor(k) {
      this.k = k;
      this.heap = [];
    }
    insert(item) {
      if (this.heap.length < this.k) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
      } else if (item.count > this.heap[0].count) {
        this.heap[0] = item;
        this.sinkDown(0);
      }
    }
    getTopK() {
      return this.heap.sort((a, b) => b.count - a.count);
    }
    bubbleUp(index) {
      const element = this.heap[index];
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        const parent = this.heap[parentIndex];
        if (element.count >= parent.count) break;
        this.heap[index] = parent;
        index = parentIndex;
      }
      this.heap[index] = element;
    }
    sinkDown(index) {
      const length = this.heap.length;
      const element = this.heap[index];
      while (true) {
        let left = 2 * index + 1, right = 2 * index + 2, swap = null;
        if (left < length && this.heap[left].count < element.count) swap = left;
        if (right < length &&
          ((swap === null && this.heap[right].count < element.count) ||
          (swap !== null && this.heap[right].count < this.heap[left].count))) {
          swap = right;
        }
        if (swap === null) break;
        this.heap[index] = this.heap[swap];
        index = swap;
      }
      this.heap[index] = element;
    }
  }
  class NgramIndex {
    constructor(n) {
      this.n = n;
      this.index = new Map();
      this.wordNgrams = new Map();
    }
    generateNgrams(word) {
      const ngrams = new Set();
      const padded = ` ${word} `;
      for (let i = 0; i <= padded.length - this.n; i++) {
        ngrams.add(padded.substring(i, i + this.n));
      }
      return Array.from(ngrams);
    }
    addWord(word) {
      word = word.toLowerCase();
      const ngrams = this.generateNgrams(word);
      this.wordNgrams.set(word, ngrams);
      for (const ngram of ngrams) {
        if (!this.index.has(ngram)) this.index.set(ngram, []);
        this.index.get(ngram).push(word);
      }
    }
    jaccardSimilarity(setA, setB) {
      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      return intersection.size / union.size;
    }
    getSuggestions(query, limit) {
      query = query.toLowerCase();
      const queryNgrams = this.generateNgrams(query);
      const querySet = new Set(queryNgrams);
      const candidateCounts = new Map();
      for (const ngram of queryNgrams) {
        const words = this.index.get(ngram) || [];
        for (const word of words) {
          candidateCounts.set(word, (candidateCounts.get(word) || 0) + 1);
        }
      }
      const suggestions = [];
      for (const [word] of candidateCounts.entries()) {
        const wordSet = new Set(this.wordNgrams.get(word));
        const sim = this.jaccardSimilarity(querySet, wordSet);
        if (sim > 0.2) suggestions.push({ word, similarity: sim });
      }
      return suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
  }

  // --- INITIALIZATION ---
  const trie = new Trie();
  const ngramIndex = new NgramIndex(N_GRAM_SIZE);
  let corpus = [
    "javascript", "typescript", "react", "angular", "vue", "svelte", "node js", "deno",
    "python", "django", "flask", "fastapi", "java", "spring boot", "kotlin",
    "data structures", "algorithms", "system design", "machine learning", "artificial intelligence",
    "deep learning", "natural language processing", "computer vision", "web development",
    "mobile development", "devops", "cloud computing", "aws", "google cloud", "azure",
    "docker", "kubernetes", "git", "github", "agile", "scrum", "sql", "postgresql", "mongodb", "redis"
  ];
  function initializeCorpus() {
    corpus.forEach(word => {
      trie.insert(word);
      ngramIndex.addWord(word);
    });
    trie.insert("javascript");
    trie.insert("javascript");
    trie.insert("python");
    trie.insert("react");
  }
  initializeCorpus();

  // --- EVENT HANDLERS ---
  searchInput.addEventListener('keyup', handleSearch);
  addWordBtn.addEventListener('click', handleAddWord);
  newWordInput.addEventListener('keyup', e => { if (e.key === 'Enter') handleAddWord(); });
  document.addEventListener('click', e => { if (!searchInput.contains(e.target)) suggestionsBox.classList.add('hidden'); });

  // --- CORE LOGIC ---
  function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) { suggestionsBox.classList.add('hidden'); return; }
    loader.classList.remove('hidden');
    setTimeout(() => {
      let combined = new Map();
      const prefixNode = trie.findNode(query);
      if (prefixNode) {
        const prefixWords = trie.findAllWords(prefixNode, query.toLowerCase());
        const heap = new MinHeap(TOP_K);
        prefixWords.forEach(item => heap.insert(item));
        heap.getTopK().forEach(s => combined.set(s.word, { type: 'prefix', score: s.count }));
      }
      if (combined.size < TOP_K) {
        const fuzzyLimit = TOP_K - combined.size;
        const fuzzy = ngramIndex.getSuggestions(query, fuzzyLimit * 2);
        fuzzy.forEach(match => {
          if (!combined.has(match.word)) combined.set(match.word, { type: 'fuzzy', score: match.similarity });
        });
      }
      const final = Array.from(combined.entries())
        .map(([word, data]) => ({ word, ...data }))
        .sort((a, b) => {
          if (a.type === 'prefix' && b.type !== 'prefix') return -1;
          if (a.type !== 'prefix' && b.type === 'prefix') return 1;
          return b.score - a.score;
        })
        .slice(0, TOP_K);
      displaySuggestions(final, query);
      loader.classList.add('hidden');
    }, 50);
  }
  function displaySuggestions(suggestions, query) {
    if (!suggestions.length) { suggestionsBox.classList.add('hidden'); return; }
    suggestionsBox.innerHTML = '';
    suggestions.forEach(s => {
      const div = document.createElement('div');
      div.className = 'p-3 border-b border-gray-100 cursor-pointer suggestion-item flex justify-between items-center';
      const regex = new RegExp(`(${query})`, 'gi');
      const highlighted = s.word.replace(regex, '<span class="font-semibold text-blue-600">$1</span>');
      div.innerHTML = `<span class="text-gray-700">${highlighted}</span>${s.type === 'fuzzy' ? '<span class="text-xs bg-yellow-200 text-yellow-800 font-medium px-2 py-1 rounded-full">fuzzy</span>' : ''}`;
      div.addEventListener('click', () => { searchInput.value = s.word; suggestionsBox.classList.add('hidden'); });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.classList.remove('hidden');
  }
  function handleAddWord() {
    const newWord = newWordInput.value.trim();
    if (newWord) {
      trie.insert(newWord);
      ngramIndex.addWord(newWord);
      corpus.push(newWord);
      newWordInput.value = '';
      feedbackMsg.textContent = `"${newWord}" added to corpus!`;
      setTimeout(() => feedbackMsg.textContent = '', 3000);
    }
  }
});
