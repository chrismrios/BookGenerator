// Global Variables
let currentLibrary = null;
let selectedBook = null;  // Variable to store the currently viewed book in the modal

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Materialize Components
    M.AutoInit();

    // Load Libraries
    loadLibraries();

    // Initialize Tabs and Modals
    var tabs = document.querySelectorAll('.tabs');
    M.Tabs.init(tabs);

    var modals = document.querySelectorAll('.modal');
    M.Modal.init(modals);

    // Setup Scanner Input
    setupScannerInput();
});

// Load Libraries into List
function loadLibraries() {
    fetch("/libraries")
        .then(response => response.json())
        .then(data => {
            const libraryContent = document.getElementById("library-content");
            libraryContent.innerHTML = '';
            document.getElementById("libraries-header").style.display = 'block';
            document.getElementById("libraries-search").style.display = 'block';
            document.getElementById("library-book-search").style.display = 'none';

            data.forEach(library => {
                const libraryCard = createLibraryCard(library);
                libraryContent.appendChild(libraryCard);
            });
        });
}

// Create Library Card
function createLibraryCard(library) {
    const col = document.createElement('div');
    col.classList.add('col', 's12', 'm6', 'l4', 'library-card');

    const card = document.createElement('div');
    card.classList.add('card', 'hoverable');

    const cardContent = document.createElement('div');
    cardContent.classList.add('card-content');

    const title = document.createElement('span');
    title.classList.add('card-title');
    title.textContent = library.name;
    cardContent.appendChild(title);

    const info = document.createElement('p');
    info.innerHTML = `<strong>Books:</strong> ${library.book_count}<br><strong>Created:</strong> ${library.created_at}`;
    cardContent.appendChild(info);

    const cardAction = document.createElement('div');
    cardAction.classList.add('card-action');

    const selectBtn = document.createElement('a');
    selectBtn.href = '#!';
    selectBtn.textContent = 'Select';
    selectBtn.addEventListener('click', () => selectLibrary(library));
    cardAction.appendChild(selectBtn);

    const deleteBtn = document.createElement('a');
    deleteBtn.href = '#!';
    deleteBtn.textContent = 'Delete';
    deleteBtn.classList.add('red-text');
    deleteBtn.addEventListener('click', () => deleteLibrary(library.id));
    cardAction.appendChild(deleteBtn);

    card.appendChild(cardContent);
    card.appendChild(cardAction);
    col.appendChild(card);
    return col;
}

// Create Library Prompt
function createLibraryPrompt() {
    const libraryName = prompt("Enter a name for your library:");
    if (!libraryName) return;

    fetch("/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: libraryName }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
        } else {
            showToast(data.message);
            loadLibraries();
        }
    })
    .catch(error => {
        console.error("Error creating library:", error);
        showToast("Error creating library. Please try again.");
    });
}

// Select Library
function selectLibrary(library) {
    currentLibrary = library;
    showToast(`Selected Library: ${library.name}`);
    document.getElementById("selected-library-name").textContent = `Current Library: ${library.name}`;

    // Hide Libraries List and Show Back Button
    document.getElementById("libraries-header").style.display = 'none';
    document.getElementById("libraries-search").style.display = 'none';
    document.getElementById("library-book-search").style.display = 'block';

    const libraryContent = document.getElementById("library-content");
    libraryContent.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.classList.add('btn', 'blue-grey', 'darken-1', 'sticky-button');
    backBtn.textContent = 'Back to Library List';
    backBtn.addEventListener('click', () => {
        loadLibraries();
        document.getElementById("libraries-header").style.display = 'block';
        document.getElementById("libraries-search").style.display = 'block';
        document.getElementById("library-book-search").style.display = 'none';
        document.getElementById("selected-library-name").textContent = `No library selected.`;
        currentLibrary = null;
    });
    libraryContent.appendChild(backBtn);

    // View Books in the Library
    viewLibraryBooks(library.id);
}

// View Books in a Library
function viewLibraryBooks(libraryId, searchQuery = '') {
    fetch(`/library/${libraryId}/books?search=${encodeURIComponent(searchQuery)}`)
        .then(response => response.json())
        .then(data => {
            const libraryContent = document.getElementById("library-content");

            if (data.error) {
                showToast(data.error);
                return;
            }

            // Remove existing book cards before adding new ones
            const existingCards = libraryContent.querySelectorAll('.book-card');
            existingCards.forEach(card => card.remove());

            if (data.length === 0) {
                const noBooksMsg = document.createElement('p');
                noBooksMsg.textContent = "No books found in this library.";
                libraryContent.appendChild(noBooksMsg);
                return;
            }

            data.forEach(book => {
                const bookCard = createBookCard(book, true);
                libraryContent.appendChild(bookCard);
            });
        })
        .catch(error => {
            console.error("Error loading books:", error);
            showToast("Error loading books. Please try again later.");
        });
}

// Delete Library
function deleteLibrary(libraryId) {
    if (!confirm("Are you sure you want to delete this library? This action cannot be undone.")) return;

    fetch(`/library/${libraryId}`, {
        method: "DELETE",
    })
        .then(response => response.json())
        .then(data => {
            showToast(data.message);
            if (currentLibrary && currentLibrary.id === libraryId) {
                currentLibrary = null;
                document.getElementById("selected-library-name").textContent = `No library selected.`;
            }
            loadLibraries();
        });
}

// Search Books
function searchBooks() {
    const query = document.getElementById("search-query").value.trim();
    if (!query) {
        showToast("Please enter a search query!");
        return;
    }

    fetch(`/search?q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            const searchResults = document.getElementById("search-results");
            searchResults.innerHTML = '';

            if (data.error) {
                showToast(data.error);
                return;
            }

            if (data.length === 0) {
                searchResults.innerHTML = "<p>No books found. Please try another search.</p>";
                return;
            }

            data.forEach(book => {
                const bookCard = createBookCard(book, false);
                searchResults.appendChild(bookCard);
            });
        })
        .catch(error => {
            console.error("Error fetching books:", error);
            showToast("Error fetching books. Please try again later.");
        });
}

// Create Book Card
function createBookCard(book, inLibrary = false) {
    const col = document.createElement('div');
    col.classList.add('col', 's12', 'book-card'); // Full-width columns

    const card = document.createElement('div');
    card.classList.add('card', 'horizontal', 'hoverable'); // Added 'horizontal' class

    const cardImage = document.createElement('div');
    cardImage.classList.add('card-image');
    const img = document.createElement('img');
    img.src = book.thumbnail || '/static/default-thumbnail.png';
    img.style.width = '80px'; // Adjusted width
    img.style.height = '120px'; // Adjusted height
    img.style.objectFit = 'cover';
    cardImage.appendChild(img);

    const cardStacked = document.createElement('div');
    cardStacked.classList.add('card-stacked');

    const cardContent = document.createElement('div');
    cardContent.classList.add('card-content');
    const title = document.createElement('p');
    title.classList.add('book-title');
    title.textContent = book.title;
    cardContent.appendChild(title);
    const authors = document.createElement('p');
    authors.classList.add('grey-text', 'text-darken-2', 'book-authors');
    authors.textContent = `Author(s): ${book.authors?.join(', ') || 'Unknown Author'}`;
    cardContent.appendChild(authors);
    const publishedDate = document.createElement('p');
    publishedDate.classList.add('grey-text', 'text-darken-2', 'book-published-date');
    publishedDate.textContent = `Published: ${book.publishedDate || 'Unknown'}`;
    cardContent.appendChild(publishedDate);

    // Date Added (for books in library)
    if (inLibrary && book.added_at) {
        const addedAt = document.createElement('p');
        addedAt.classList.add('grey-text', 'text-darken-2', 'book-added-at');
        addedAt.textContent = `Added: ${book.added_at}`;
        cardContent.appendChild(addedAt);
    }

    const cardAction = document.createElement('div');
    cardAction.classList.add('card-action');
    const detailsBtn = document.createElement('a');
    detailsBtn.href = '#!';
    detailsBtn.textContent = 'Details';
    detailsBtn.addEventListener('click', () => showBookDetails(book, inLibrary));
    cardAction.appendChild(detailsBtn);

    if (!inLibrary) {
        const addBtn = document.createElement('a');
        addBtn.href = '#!';
        addBtn.textContent = 'Add to Library';
        addBtn.addEventListener('click', () => addBookToLibrary(book));
        cardAction.appendChild(addBtn);
    } else {
        const deleteBtn = document.createElement('a');
        deleteBtn.href = '#!';
        deleteBtn.textContent = 'Remove';
        deleteBtn.addEventListener('click', () => deleteBookFromLibrary(book.id));
        cardAction.appendChild(deleteBtn);
    }

    cardStacked.appendChild(cardContent);
    cardStacked.appendChild(cardAction);

    card.appendChild(cardImage);
    card.appendChild(cardStacked);
    col.appendChild(card);
    return col;
}

// Handle 'Enter' key press in search input
function handleSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchBooks();
    }
}

// Handle 'Enter' key press in tag input
function handleTagInputKeyPress(event, bookId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTag(bookId);
    }
}

// Show Book Details (modified)
function showBookDetails(book, inLibrary = false) {
    selectedBook = book;  // Store the selected book for use in modal actions
    const modalContent = document.getElementById('book-details-content');
    modalContent.innerHTML = `
        <!-- Close Button and Add to Library Button -->
        <div class="modal-header">
            <a href="#!" class="modal-close waves-effect waves-light btn-flat right">✕</a>
            ${!inLibrary ? '<button class="btn blue-grey darken-1 right" id="add-to-library-btn" onclick="addBookToLibraryFromModal()">Add to Library</button>' : ''}
        </div>
        <!-- Book Details -->
        <div class="row">
            <div class="col s12 m4">
                <img src="${book.thumbnail || '/static/default-thumbnail.png'}" alt="${book.title}" style="max-width:200px; max-height:200px; width:100%; height:auto;">
            </div>
            <div class="col s12 m8">
                <h5>${book.title}</h5>
                <p><strong>Authors:</strong> ${book.authors?.join(', ') || 'Unknown'}</p>
                <p><strong>Genres:</strong> ${book.genres?.join(', ') || 'Not specified'}</p>
                <p><strong>Publisher:</strong> ${book.publisher || 'Unknown'}</p>
                <p><strong>Published Date:</strong> ${book.publishedDate || 'Unknown'}</p>
                <p><strong>Page Count:</strong> ${book.pageCount || 'N/A'}</p>
                <p><strong>ISBN:</strong> ${book.isbn || 'N/A'}</p>
            </div>
        </div>
        <p>${book.description || 'No description available.'}</p>
        <div>
            <strong>Tags:</strong>
            <div id="tags-container">
                ${book.tags?.map(tag => `<span class="chip">${tag}<i class="material-icons" onclick="removeTag('${book.id}', '${tag}')">close</i></span>`).join('') || ''}
            </div>
            <div class="input-field">
                <input id="new-tag-input" type="text" placeholder="Add a tag" onkeypress="handleTagInputKeyPress(event, '${book.id}')">
                <label for="new-tag-input">Tag</label>
            </div>
        </div>
    `;

    // Initialize any Materialize components inside modal
    M.updateTextFields();

    const modal = M.Modal.getInstance(document.getElementById('book-details-modal'));
    modal.open();
}

// Add Book to Library from Modal
function addBookToLibraryFromModal() {
    if (!selectedBook) {
        showToast("No book selected.");
        return;
    }
    addBookToLibrary(selectedBook);
}

// Fix for Tags Not Being Added
function addTag(bookId) {
    const tagInput = document.getElementById('new-tag-input');
    const newTag = tagInput.value.trim();
    if (!newTag) return;

    // Fetch the book from the database to get current tags
    fetch(`/library/${currentLibrary.id}/books`)
        .then(response => response.json())
        .then(data => {
            const book = data.find(b => b.id === parseInt(bookId));
            if (book) {
                let currentTags = book.tags || [];
                if (!Array.isArray(currentTags)) {
                    currentTags = currentTags.split(', ');
                }
                currentTags.push(newTag);

                // Update tags on the server
                fetch(`/book/${bookId}/tags`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: currentTags }),
                })
                .then(response => response.json())
                .then(data => {
                    showToast(data.message);
                    // Update the tags in the modal
                    const tagsContainer = document.getElementById('tags-container');
                    const newChip = document.createElement('span');
                    newChip.classList.add('chip');
                    newChip.innerHTML = `${newTag}<i class="material-icons" onclick="removeTag('${bookId}', '${newTag}')">close</i>`;
                    tagsContainer.appendChild(newChip);
                    tagInput.value = '';
                });
            }
        });
}

// Remove Tag from Book
function removeTag(bookId, tag) {
    // Fetch the current tags, remove the selected tag, and update
    fetch(`/library/${currentLibrary.id}/books`)
        .then(response => response.json())
        .then(data => {
            const book = data.find(b => b.id === parseInt(bookId));
            if (book) {
                let updatedTags = book.tags || [];
                if (!Array.isArray(updatedTags)) {
                    updatedTags = updatedTags.split(', ');
                }
                updatedTags = updatedTags.filter(t => t !== tag);

                fetch(`/book/${bookId}/tags`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: updatedTags }),
                })
                .then(response => response.json())
                .then(data => {
                    showToast("Tag removed.");
                    // Remove the tag from the modal
                    const tagsContainer = document.getElementById('tags-container');
                    const chips = tagsContainer.getElementsByClassName('chip');
                    for (let chip of chips) {
                        if (chip.textContent.trim() === tag) {
                            chip.remove();
                            break;
                        }
                    }
                });
            }
        });
}

// Scanner Input Handling
function setupScannerInput() {
    let scanBuffer = '';
    let scanTimeout;

    document.addEventListener('keydown', function(event) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

        if (!isInputFocused) {
            if (scanTimeout) {
                clearTimeout(scanTimeout);
            }

            if (event.key === 'Enter') {
                const scannedCode = scanBuffer.trim();
                scanBuffer = '';
                if (scannedCode) {
                    const activeTab = document.querySelector('.tabs .tab a.active').getAttribute('href');
                    if (activeTab === '#libraries-tab' && currentLibrary) {
                        // In library view, auto-add to library
                        searchAndAddBookToLibrary(scannedCode);
                    } else {
                        // In search view, perform search and show details modal
                        searchBookByISBNAndShowDetails(scannedCode);
                    }
                }
            } else {
                scanBuffer += event.key;
                scanTimeout = setTimeout(() => {
                    scanBuffer = '';
                }, 500); // Reset buffer if no input for 500ms
            }
        }
    });
}

function searchBookByISBNAndShowDetails(isbn) {
    fetch(`/search?q=isbn:${isbn}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const book = data[0];
                showBookDetails(book);
            } else {
                showToast("Book not found.");
            }
        })
        .catch(error => {
            console.error("Error searching for book:", error);
            showToast("Error searching for book.");
        });
}

function searchAndAddBookToLibrary(isbn) {
    fetch(`/search?q=isbn:${isbn}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const book = data[0];
                addBookToLibrary(book);
            } else {
                showToast("Book not found.");
            }
        })
        .catch(error => {
            console.error("Error searching for book:", error);
            showToast("Error searching for book.");
        });
}

// Modify addBookToLibrary to update library book list
function addBookToLibrary(book) {
    if (!currentLibrary) {
        showToast("Please select a library first!");
        return;
    }

    fetch(`/library/${currentLibrary.id}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
    })
        .then(response => response.json())
        .then(data => {
            showToast(data.message);
            // Update the book count
            loadLibraries();
            // Refresh the library book list if viewing
            if (document.querySelector('.tabs .tab a.active').getAttribute('href') === '#libraries-tab' && currentLibrary) {
                // Re-fetch and display books in the library
                viewLibraryBooks(currentLibrary.id);
            }
        })
        .catch(error => {
            console.error("Error adding book to library:", error);
            showToast("Error adding book to library.");
        });
}

// Delete Book from Library
function deleteBookFromLibrary(bookId) {
    if (!currentLibrary) {
        showToast("No library selected.");
        return;
    }

    fetch(`/library/${currentLibrary.id}/book/${bookId}`, {
        method: "DELETE",
    })
    .then(response => response.json())
    .then(data => {
        showToast(data.message);
        // Refresh the library book list
        viewLibraryBooks(currentLibrary.id);
        // Update the book count
        loadLibraries();
    });
}

// Show Toast Notification
function showToast(message) {
    M.toast({ html: message, displayLength: 3000 });
}

// Filter Libraries
function filterLibraries() {
    const query = document.getElementById("library-search").value.toLowerCase();
    const libraryCards = document.getElementsByClassName("library-card");

    Array.from(libraryCards).forEach(card => {
        const libraryName = card.querySelector(".card-title").textContent.toLowerCase();
        if (libraryName.includes(query)) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
}

// Filter Books in Library
function filterLibraryBooks() {
    const query = document.getElementById("library-book-search-input").value.trim();
    viewLibraryBooks(currentLibrary.id, query);
}

// Export Libraries
function exportLibraries() {
    window.location.href = '/export';
}