// Global Variables
let currentLibrary = null;
let selectedBook = null;
let currentBookList = [];
let currentBookIndex = 0;
let viewMode = 'list'; // 'list' or 'grid'
let sortOrder = 'date_desc'; // 'date_desc', 'date_asc', 'alpha_asc', 'alpha_desc'
let currentBookListSource = 'search'; // 'search' or 'library'

// Barcode Scanner Variables
let barcode = '';
let barcodeTimeout;
const barcodeTimeoutDuration = 100; // Time in ms to reset the barcode buffer

// Initialize Materialize Components, Event Listeners, and Load Initial Data
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Materialize Components
    M.AutoInit();

    // Initialize Sidenav
    var sidenavs = document.querySelectorAll('.sidenav');
    M.Sidenav.init(sidenavs);

    // Initialize Selects
    var selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);

    // Initialize Modals
    var modals = document.querySelectorAll('.modal');
    M.Modal.init(modals, {
        dismissible: true,
        opacity: 0.7,
        inDuration: 300,
        outDuration: 200
    });

    // Load Libraries into Left Nav
    loadLibrariesIntoNav();

    // Start on Search Tab
    navigateTo('search');

    // Initialize Tooltips
    var tooltips = document.querySelectorAll('.tooltipped');
    M.Tooltip.init(tooltips);

    // Initialize Barcode Scanner
    initializeBarcodeScanner();

    // Handle the Create Library Form Submission
    const createLibraryForm = document.getElementById('create-library-form');
    if (createLibraryForm) {
        createLibraryForm.addEventListener('submit', function(event) {
            event.preventDefault(); // Prevent the form from submitting the default way

            const libraryNameInput = document.getElementById('library-name-input');
            const libraryTagsInput = document.getElementById('library-tags-input');

            const libraryName = libraryNameInput.value.trim();
            const libraryTagsRaw = libraryTagsInput.value.trim();
            const libraryTags = libraryTagsRaw ? libraryTagsRaw.split(',').map(tag => tag.trim()) : [];

            if (!libraryName) {
                showToast("Library name is required.");
                return;
            }

            // Prepare the data to send
            const data = {
                name: libraryName,
                tags: libraryTags
            };

            // Send POST request to create the library
            fetch('/library', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error);
                } else {
                    showToast(data.message);
                    // Close the modal
                    const modalInstance = M.Modal.getInstance(document.getElementById('create-library-modal'));
                    modalInstance.close();
                    // Clear form inputs
                    libraryNameInput.value = '';
                    libraryTagsInput.value = '';
                    M.updateTextFields();
                    // Refresh the libraries list
                    loadYourLibraries();
                    loadLibrariesIntoNav();
                }
            })
            .catch(error => {
                console.error("Error creating library:", error);
                showToast("Error creating library.");
            });
        });
    }
});

/* ------------------- Navigation and Library Loading ------------------- */

// Navigation Function
function navigateTo(tab) {
    if (tab === 'search') {
        document.getElementById('search-tab').style.display = 'block';
        document.getElementById('libraries-tab').style.display = 'none';
        document.getElementById('selected-library-tab').style.display = 'none';
    } else if (tab === 'libraries') {
        document.getElementById('search-tab').style.display = 'none';
        document.getElementById('libraries-tab').style.display = 'block';
        document.getElementById('selected-library-tab').style.display = 'none';
        loadYourLibraries();
    } else if (tab === 'selected_library') {
        document.getElementById('search-tab').style.display = 'none';
        document.getElementById('libraries-tab').style.display = 'none';
        document.getElementById('selected-library-tab').style.display = 'block';
    }

    // Restart barcode scanner when view changes (if applicable)
    restartBarcodeScanner();
}

// Load Libraries into Left Nav
function loadLibrariesIntoNav() {
    fetch("/libraries")
        .then(response => response.json())
        .then(data => {
            const navLibraryList = document.getElementById("nav-library-list");
            navLibraryList.innerHTML = '';
            data.forEach(library => {
                const libItem = document.createElement('li');
                const libLink = document.createElement('a');
                libLink.href = '#!';
                libLink.textContent = library.name;
                libLink.onclick = () => {
                    selectLibrary(library);
                    navigateTo('selected_library');
                };
                libItem.appendChild(libLink);
                navLibraryList.appendChild(libItem);
            });
            highlightSelectedLibrary();
        })
        .catch(error => {
            console.error("Error loading libraries into nav:", error);
            showToast("Error loading libraries.");
        });
}

// Highlight Selected Library in Nav
function highlightSelectedLibrary() {
    const libraryLinks = document.querySelectorAll('#nav-library-list a');
    libraryLinks.forEach(link => {
        link.classList.remove('active-library');
        if (currentLibrary && link.textContent.trim() === currentLibrary.name) {
            link.classList.add('active-library');
        }
    });
}

// Load "Your Libraries" with Export/Import and Search
function loadYourLibraries() {
    fetch("/your_libraries")
        .then(response => response.json())
        .then(data => {
            const yourLibrariesList = document.getElementById("your-libraries-list");
            yourLibrariesList.innerHTML = '';
            data.forEach(library => {
                const libraryCard = createYourLibraryCard(library);
                yourLibrariesList.appendChild(libraryCard);
            });
        })
        .catch(error => {
            console.error("Error loading your libraries:", error);
            showToast("Error loading your libraries.");
        });
}

/* ------------------- Create "Your Library" Card ------------------- */

// Create "Your Library" Card
function createYourLibraryCard(library) {
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

    const genres = document.createElement('p');
    genres.innerHTML = `<strong>Genres:</strong> ${library.tags.join(', ') || 'None'}`;
    cardContent.appendChild(genres);

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
    deleteBtn.classList.add('red-text', 'delete-library-btn');
    deleteBtn.addEventListener('click', () => deleteLibraryPrompt(library.id));
    cardAction.appendChild(deleteBtn);

    card.appendChild(cardContent);
    card.appendChild(cardAction);
    col.appendChild(card);
    return col;
}

/* ------------------- Select and Display Library ------------------- */

// Select a Library and Display Its Books
function selectLibrary(library) {
    currentLibrary = library;
    showToast(`Selected Library: ${library.name}`);
    document.getElementById("library-book-search").style.display = 'block';

    document.getElementById("back-button-container").style.display = 'block';
    document.getElementById("library-header").style.display = 'block';

    document.getElementById("library-name").textContent = library.name;
    document.getElementById("library-book-count").textContent = `Total Books: ${library.book_count}`;

    highlightSelectedLibrary();

    const libraryContent = document.getElementById("library-content");
    libraryContent.innerHTML = '';

    viewLibraryBooks(library.id);
}

// Go Back to "Your Libraries" List
function goBackToLibraryList() {
    navigateTo('libraries');
    document.getElementById("library-book-search").style.display = 'none';
    document.getElementById("back-button-container").style.display = 'none';
    document.getElementById("library-header").style.display = 'none';
    currentLibrary = null;
}

/* ------------------- Delete Library Functionality ------------------- */

// Delete Library Prompt
function deleteLibraryPrompt(libraryId) {
    if (!libraryId) return;
    if (!confirm(`Are you sure you want to delete the library? This action cannot be undone.`)) return;
    deleteLibrary(libraryId);
}

// Delete Library
function deleteLibrary(libraryId) {
    fetch(`/library/${libraryId}`, {
        method: "DELETE",
    })
    .then(response => {
        if (!response.ok) {
            // If the response is not OK, try to parse it as text
            return response.text().then(text => { throw new Error(text) });
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            showToast(data.error);
            return;
        }
        showToast(data.message);
        loadYourLibraries();
        loadLibrariesIntoNav();
        if (currentLibrary && currentLibrary.id === libraryId) {
            currentLibrary = null;
            document.getElementById("library-header").style.display = 'none';
            document.getElementById("library-content").innerHTML = '';
            document.getElementById("library-book-search").style.display = 'none';
            document.getElementById("back-button-container").style.display = 'none';
            navigateTo('libraries');
        }
    })
    .catch(error => {
        console.error("Error deleting library:", error);
        // Attempt to parse JSON error message
        try {
            const errorMessage = JSON.parse(error.message);
            if (errorMessage.error) {
                showToast(errorMessage.error);
            } else {
                showToast("An unexpected error occurred.");
            }
        } catch {
            showToast("Error deleting library. Please try again.");
        }
    });
}

/* ------------------- View and Filter Library Books ------------------- */

// View Books in a Library with Filters
function viewLibraryBooks(libraryId, searchQuery = '', filters = {}) {
    currentBookListSource = 'library';
    let queryParams = `?search=${encodeURIComponent(searchQuery)}&sort=${sortOrder}`;

    // Append filters
    if (filters.genre) {
        queryParams += `&genre=${encodeURIComponent(filters.genre)}`;
    }
    if (filters.rating) {
        queryParams += `&rating=${encodeURIComponent(filters.rating)}`;
    }
    if (filters.read !== undefined) {
        queryParams += `&read=${encodeURIComponent(filters.read)}`;
    }

    fetch(`/library/${libraryId}/books${queryParams}`)
        .then(response => response.json())
        .then(data => {
            const libraryContent = document.getElementById("library-content");

            if (data.error) {
                showToast(data.error);
                return;
            }

            libraryContent.innerHTML = '';

            if (data.length === 0) {
                const noBooksMsg = document.createElement('p');
                noBooksMsg.textContent = "No books found in this library.";
                libraryContent.appendChild(noBooksMsg);
                return;
            }

            currentBookList = data;
            currentBookIndex = 0;

            data.forEach(book => {
                const bookCard = createBookCard(book, true);
                libraryContent.appendChild(bookCard);
            });

            // Populate Genre Filter Dropdown
            populateGenreFilter(data);
            // Re-initialize tooltips
            var tooltips = libraryContent.querySelectorAll('.remove-button');
            tooltips.forEach(elem => {
                M.Tooltip.init(elem);
            });
        })
        .catch(error => {
            console.error("Error loading books:", error);
            showToast("Error loading books. Please try again later.");
        });
}

// Populate Genre Filter Dropdown
function populateGenreFilter(books) {
    const genreFilter = document.getElementById("genre-filter");
    const genres = new Set();
    books.forEach(book => {
        book.genres.forEach(genre => genres.add(genre));
    });

    // Clear existing options except the first
    genreFilter.innerHTML = '<option value="" disabled selected>Filter by Genre</option>';

    genres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });

    // Re-initialize the select
    M.FormSelect.init(genreFilter);
}

/* ------------------- Search "Your Libraries" ------------------- */

// Search "Your Libraries"
function searchYourLibraries() {
    const query = document.getElementById("library-search-query").value.trim();
    loadYourLibrariesFiltered(query);
}

// Load "Your Libraries" with Optional Search
function loadYourLibrariesFiltered(searchQuery = '') {
    fetch(`/your_libraries?search=${encodeURIComponent(searchQuery)}`)
        .then(response => response.json())
        .then(data => {
            const yourLibrariesList = document.getElementById("your-libraries-list");
            yourLibrariesList.innerHTML = '';
            data.forEach(library => {
                const libraryCard = createYourLibraryCard(library);
                yourLibrariesList.appendChild(libraryCard);
            });
        })
        .catch(error => {
            console.error("Error loading filtered libraries:", error);
            showToast("Error loading libraries.");
        });
}

/* ------------------- Create Book Cards (List and Grid Views) ------------------- */

// Create Book Card
function createBookCard(book, inLibrary = false) {
    let card;
    if (viewMode === 'list') {
        card = createHorizontalBookCard(book, inLibrary);
    } else {
        card = createVerticalBookCard(book, inLibrary);
    }
    return card;
}

// Create Horizontal Book Card (List View)
function createHorizontalBookCard(book, inLibrary = false) {
    const col = document.createElement('div');
    col.classList.add('col', 's12', 'book-card');

    const card = document.createElement('div');
    card.classList.add('card', 'hoverable', 'horizontal-book-card');

    // Flex Container
    const flexContainer = document.createElement('div');
    flexContainer.classList.add('card-content-flex');

    // Book Image
    const cardImage = document.createElement('div');
    cardImage.classList.add('book-image');
    const img = document.createElement('img');
    img.src = book.thumbnail || '/static/default-thumbnail.png';
    img.alt = book.title;
    cardImage.appendChild(img);

    // Add click event to image
    img.addEventListener('click', () => showBookDetails(book, inLibrary));
    
    cardImage.appendChild(img);
    // Book Details
    const bookDetails = document.createElement('div');
    bookDetails.classList.add('book-details');

    const title = document.createElement('p');
    title.classList.add('book-title');
    title.textContent = book.title;
    bookDetails.appendChild(title);

    const authors = document.createElement('p');
    authors.classList.add('book-authors');
    authors.innerHTML = `<strong>Author:</strong> ${book.authors.join(', ') || 'Unknown Author'}`;
    bookDetails.appendChild(authors);

    const genres = document.createElement('p');
    genres.classList.add('book-genres');
    genres.innerHTML = `<strong>Genre:</strong> ${book.genres.join(', ') || 'N/A'}`;
    bookDetails.appendChild(genres);

    if (inLibrary) {
        const dateAdded = document.createElement('p');
        dateAdded.classList.add('date-added');
        dateAdded.innerHTML = `<strong>Added:</strong> ${new Date(book.added_at).toLocaleDateString()}`;
        bookDetails.appendChild(dateAdded);
    }

    flexContainer.appendChild(cardImage);
    flexContainer.appendChild(bookDetails);
    card.appendChild(flexContainer);

    // Buttons Container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.classList.add('buttons-container');

    // Details Button
    const detailsBtn = document.createElement('a');
    detailsBtn.href = '#!';
    detailsBtn.textContent = 'Details';
    detailsBtn.classList.add('btn-flat');
    detailsBtn.addEventListener('click', () => showBookDetails(book, inLibrary));
    buttonsContainer.appendChild(detailsBtn);

    // Add to Library Button (Only in Search Results)
    if (!inLibrary) {
        const addToLibraryBtn = document.createElement('a');
        addToLibraryBtn.href = '#!';
        addToLibraryBtn.textContent = 'Add to Library';
        addToLibraryBtn.classList.add('btn-flat', 'green-text');
        addToLibraryBtn.addEventListener('click', () => addBookToLibrary(book));
        buttonsContainer.appendChild(addToLibraryBtn);
    }

    // Read Toggle
    if (inLibrary) {
        const readToggle = document.createElement('label');
        readToggle.classList.add('read-toggle');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = book.is_read;
        checkbox.onchange = () => toggleReadStatus(book.id, checkbox.checked);

        const span = document.createElement('span');
        span.textContent = 'Read';

        readToggle.appendChild(checkbox);
        readToggle.appendChild(span);
        buttonsContainer.appendChild(readToggle);
    }

    // Rating Label and Stars
    if (inLibrary) {
        const ratingContainer = document.createElement('div');
        ratingContainer.classList.add('rating-container');
        
        const ratingLabel = document.createElement('span');
        ratingLabel.textContent = 'Rating: ';
        ratingLabel.classList.add('rating-label');
        ratingContainer.appendChild(ratingLabel);

        const starRating = document.createElement('div');
        starRating.classList.add('star-rating');
        starRating.innerHTML = createStarRatingHTML(book.rating, book.id);
        ratingContainer.appendChild(starRating);

        buttonsContainer.appendChild(ratingContainer);
    }

    // Remove Button with Class to Push It to Far Right
    if (inLibrary) {
        const removeBtn = document.createElement('a');
        removeBtn.href = '#!';
        removeBtn.textContent = 'Remove';
        removeBtn.classList.add('remove-button', 'remove-button-right'); // Added 'remove-button-right' class
        removeBtn.title = 'Remove this book'; // Tooltip text
        removeBtn.addEventListener('click', () => deleteBookFromLibrary(book.id));
        buttonsContainer.appendChild(removeBtn);
    }

    card.appendChild(buttonsContainer);
    col.appendChild(card);
    return col;
}

// Create Vertical Book Card (Grid View)
function createVerticalBookCard(book, inLibrary = false) {
    const col = document.createElement('div');
    col.classList.add('col', 's12', 'm6', 'l3', 'book-card');

    const card = document.createElement('div');
    card.classList.add('card', 'hoverable');

    // Book Image at Top
    const cardImage = document.createElement('div');
    cardImage.classList.add('book-image');
    const img = document.createElement('img');
    img.src = book.thumbnail || '/static/default-thumbnail.png';
    img.alt = book.title;
    cardImage.appendChild(img);
    card.appendChild(cardImage);

    // Add click event to image
    img.addEventListener('click', () => showBookDetails(book, inLibrary));
    
    cardImage.appendChild(img);
    card.appendChild(cardImage);

    // Book Details
    const cardContent = document.createElement('div');
    cardContent.classList.add('card-content');

    const title = document.createElement('p');
    title.classList.add('book-title');
    title.textContent = book.title;
    cardContent.appendChild(title);

    const authors = document.createElement('p');
    authors.classList.add('book-authors');
    authors.innerHTML = `<strong>Author:</strong> ${book.authors.join(', ') || 'Unknown Author'}`;
    cardContent.appendChild(authors);

    const genres = document.createElement('p');
    genres.classList.add('book-genres');
    genres.innerHTML = `<strong>Genre:</strong> ${book.genres.join(', ') || 'N/A'}`;
    cardContent.appendChild(genres);

    if (inLibrary) {
        const dateAdded = document.createElement('p');
        dateAdded.classList.add('date-added');
        dateAdded.innerHTML = `<strong>Added:</strong> ${new Date(book.added_at).toLocaleDateString()}`;
        cardContent.appendChild(dateAdded);
    }

    card.appendChild(cardContent);

    // Buttons Container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.classList.add('buttons-container');

    // Details Button
    const detailsBtn = document.createElement('a');
    detailsBtn.href = '#!';
    detailsBtn.textContent = 'Details';
    detailsBtn.classList.add('btn-flat');
    detailsBtn.addEventListener('click', () => showBookDetails(book, inLibrary));
    buttonsContainer.appendChild(detailsBtn);

    // Read Toggle
    if (inLibrary) {
        const readToggle = document.createElement('label');
        readToggle.classList.add('read-toggle');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = book.is_read;
        checkbox.onchange = () => toggleReadStatus(book.id, checkbox.checked);

        const span = document.createElement('span');
        span.textContent = 'Read';

        readToggle.appendChild(checkbox);
        readToggle.appendChild(span);
        buttonsContainer.appendChild(readToggle);
    }

    // Rating
    if (inLibrary) {
        const starRating = document.createElement('div');
        starRating.classList.add('star-rating');
        starRating.innerHTML = createStarRatingHTML(book.rating, book.id);
        buttonsContainer.appendChild(starRating);
    }

    // Remove Button
    if (inLibrary) {
        const removeBtn = document.createElement('a');
        removeBtn.href = '#!';
        removeBtn.textContent = 'Remove';
        removeBtn.classList.add('remove-button');
        removeBtn.title = 'Remove this book'; // Tooltip text
        removeBtn.addEventListener('click', () => deleteBookFromLibrary(book.id));
        buttonsContainer.appendChild(removeBtn);
    }

    card.appendChild(buttonsContainer);
    col.appendChild(card);
    return col;
}

/* ------------------- Star Rating Functionality ------------------- */

// Create Star Rating HTML
function createStarRatingHTML(rating, bookId) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += `<i class="material-icons star selected" onclick="setBookRating(${bookId}, ${i})">star</i>`;
        } else {
            stars += `<i class="material-icons star" onclick="setBookRating(${bookId}, ${i})">star_border</i>`;
        }
    }
    return stars;
}

// Set Book Rating
function setBookRating(bookId, rating) {
    fetch(`/book/${bookId}/update_rating`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
        } else {
            showToast(data.message);
            // Update the rating in the UI
            const modalContent = document.getElementById('book-details-content');
            if (modalContent) {
                const starElements = modalContent.querySelectorAll('.star');
                starElements.forEach((star, index) => {
                    if (index < rating) {
                        star.classList.add('selected');
                        star.textContent = 'star';
                    } else {
                        star.classList.remove('selected');
                        star.textContent = 'star_border';
                    }
                });
            }
            // Also update the book list
            if (currentBookListSource === 'library') {
                viewLibraryBooks(currentLibrary.id);
            } else if (currentBookListSource === 'search') {
                searchBooks();
            }
        }
    })
    .catch(error => {
        console.error("Error setting book rating:", error);
        showToast("Error setting book rating.");
    });
}

/* ------------------- Read/Unread Status Functionality ------------------- */

// Toggle Read/Unread Status
function toggleReadStatus(bookId, isRead) {
    fetch(`/book/${bookId}/update_status`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: isRead }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
        } else {
            showToast(data.message);
            // Update the read status in the UI
            if (currentBookListSource === 'library') {
                viewLibraryBooks(currentLibrary.id);
            }
        }
    })
    .catch(error => {
        console.error("Error toggling read status:", error);
        showToast("Error updating read status.");
    });
}

/* ------------------- Book Search Functionality ------------------- */
// Handle 'Enter' key press in search input
function handleSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchBooks();
    }
}

// Search Books
function searchBooks() {
    currentBookListSource = 'search';
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

            currentBookList = data;
            currentBookIndex = 0;

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

/* ------------------- Show Book Details Modal ------------------- */

// Show Book Details
function showBookDetails(book, inLibrary = false) {
    selectedBook = book;
    currentBookIndex = currentBookList.findIndex(b => b.id === book.id);

    const modalContent = document.getElementById('book-details-content');
    modalContent.innerHTML = `
        <!-- Modal Header -->
        <div class="modal-header">
            <h5>${book.title}</h5>
            <div>
                <button class="btn modal-close btn-flat right">✕</button>
                ${!inLibrary ? `<button class="btn btn-modern right" onclick="addBookToLibraryFromModal()">Add to Library</button>` : ''}
                ${inLibrary ? `<button class="btn btn-modern right" onclick="refreshBookImage(${book.id})">Refresh Image</button>` : ''}
            </div>
        </div>
        <!-- Modal Content -->
        <div class="row">
            <div class="col s12 m4">
                <img src="${book.thumbnail || '/static/default-thumbnail.png'}" alt="${book.title}" class="responsive-img">
                ${inLibrary ? `
                <div style="margin-top: 10px;">
                    <strong>Tags:</strong>
                    <div id="tags-container">
                        ${book.tags.map(tag => `<span class="chip">${tag}<i class="material-icons" onclick="removeTag(${book.id}, '${tag}')">close</i></span>`).join('') || ''}
                    </div>
                    <div class="input-field">
                        <input id="new-tag-input" type="text" placeholder="Add a tag" onkeypress="handleTagInputKeyPress(event, ${book.id})">
                        <label for="new-tag-input">Tag</label>
                    </div>
                    <button class="btn btn-modern" onclick="addTag(${book.id})">Add Tag</button>
                </div>
                ` : ''}
            </div>
            <div class="col s12 m8">
                <div class="book-details">
                    <p><strong>Authors:</strong> ${book.authors.join(', ') || 'Unknown'}</p>
                    <p><strong>Genres:</strong> ${book.genres.join(', ') || 'Not specified'}</p>
                    <p><strong>Publisher:</strong> ${book.publisher || 'Unknown'}</p>
                    <p><strong>Published Date:</strong> ${book.publishedDate || 'Unknown'}</p>
                    <p><strong>Page Count:</strong> ${book.pageCount || 'N/A'}</p>
                    <p><strong>ISBN:</strong> ${book.isbn || 'N/A'}</p>
                    <p class="description">${book.description || 'No description available.'}</p>
                </div>
            </div>
        </div>
        <!-- Modal Footer -->
        <div class="modal-footer">
            <button class="btn btn-modern" onclick="showNextBook()">Next</button>
        </div>
    `;

    M.updateTextFields();

    // Update star ratings
    const starElements = modalContent.querySelectorAll('.star');
    starElements.forEach((star, index) => {
        if (index < book.rating) {
            star.classList.add('selected');
            star.textContent = 'star';
        } else {
            star.classList.remove('selected');
            star.textContent = 'star_border';
        }
    });

    // Initialize tooltips for remove buttons
    var removeButtons = modalContent.querySelectorAll('.remove-button');
    removeButtons.forEach(elem => {
        M.Tooltip.init(elem, {
            html: elem.getAttribute('title'),
            position: 'top'
        });
    });

    const modal = M.Modal.getInstance(document.getElementById('book-details-modal'));
    modal.open();
}

/* ------------------- Tag Management ------------------- */

// Handle 'Enter' key press in tag input
function handleTagInputKeyPress(event, bookId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTag(bookId);
    }
}

// Add Tag to Book
function addTag(bookId) {
    const tagInput = document.getElementById('new-tag-input');
    const newTag = tagInput.value.trim();
    if (!newTag) return;

    let currentTags = selectedBook.tags || [];
    if (!currentTags.includes(newTag)) {
        currentTags.push(newTag);

        fetch(`/book/${bookId}/tags`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: currentTags }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(data.error);
            } else {
                showToast(data.message);
                selectedBook.tags = currentTags;
                updateTagsContainer();
                tagInput.value = '';
                // Update the library view
                if (currentBookListSource === 'library') {
                    viewLibraryBooks(currentLibrary.id);
                }
            }
        })
        .catch(error => {
            console.error("Error adding tag:", error);
            showToast("Error adding tag.");
        });
    } else {
        showToast("Tag already exists.");
    }
}

// Remove Tag from Book
function removeTag(bookId, tag) {
    let updatedTags = selectedBook.tags.filter(t => t !== tag);

    fetch(`/book/${bookId}/tags`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
        } else {
            showToast("Tag removed.");
            selectedBook.tags = updatedTags;
            updateTagsContainer();
            // Update the library view
            if (currentBookListSource === 'library') {
                viewLibraryBooks(currentLibrary.id);
            }
        }
    })
    .catch(error => {
        console.error("Error removing tag:", error);
        showToast("Error removing tag.");
    });
}

// Update Tags Container in Modal
function updateTagsContainer() {
    const tagsContainer = document.getElementById('tags-container');
    tagsContainer.innerHTML = selectedBook.tags.map(tag => `<span class="chip">${tag}<i class="material-icons" onclick="removeTag(${selectedBook.id}, '${tag}')">close</i></span>`).join('');
}

/* ------------------- Book Image Refresh ------------------- */

// Refresh Book Image
function refreshBookImage(bookId) {
    fetch(`/book/${bookId}/refresh_image`, {
        method: "POST",
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
        } else {
            showToast(data.message);
            const imgElement = document.querySelector('#book-details-modal img');
            if (imgElement) {
                imgElement.src = data.thumbnail || '/static/default-thumbnail.png';
            }
            // Update the book list
            if (currentBookListSource === 'library') {
                viewLibraryBooks(currentLibrary.id);
            } else if (currentBookListSource === 'search') {
                searchBooks();
            }
        }
    })
    .catch(error => {
        console.error("Error refreshing book image:", error);
        showToast("Error refreshing book image.");
    });
}

/* ------------------- Next Book Functionality ------------------- */

// Show Next Book in Details Modal
function showNextBook() {
    if (currentBookIndex + 1 < currentBookList.length) {
        currentBookIndex += 1;
    } else {
        currentBookIndex = 0;
    }
    const nextBook = currentBookList[currentBookIndex];
    const inLibrary = currentBookListSource === 'library';
    showBookDetails(nextBook, inLibrary);
}

/* ------------------- Add Book to Library ------------------- */

// Add Book to Library from Modal
function addBookToLibraryFromModal() {
    if (!selectedBook) {
        showToast("No book selected.");
        return;
    }
    addBookToLibrary(selectedBook);
}

// Add Book to Library
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
            if (data.error) {
                showToast(data.error);
                return;
            }
            showToast(data.message);
            loadYourLibraries();
            loadLibrariesIntoNav();
            if (currentLibrary) {
                viewLibraryBooks(currentLibrary.id);
            }
        })
        .catch(error => {
            console.error("Error adding book to library:", error);
            showToast("Error adding book to library.");
        });
}

/* ------------------- Export and Import Libraries ------------------- */

// Export Libraries
function exportLibraries() {
    window.open('/your_libraries/export', '_blank');
}

// Import Libraries
function importLibraries() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (!file) {
            showToast("No file selected.");
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        fetch('/your_libraries/import', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(data.error);
            } else {
                showToast(data.message);
                loadYourLibraries();
                loadLibrariesIntoNav();
            }
        })
        .catch(error => {
            console.error('Error importing libraries:', error);
            showToast('Error importing libraries.');
        });
    };
    fileInput.click();
}

/* ------------------- Toast Notification ------------------- */

// Show Toast Notification
function showToast(message) {
    M.toast({ html: message, displayLength: 3000 });
}

/* ------------------- Filter Books in Library ------------------- */

// Filter Books in Library
function filterLibraryBooks() {
    const query = document.getElementById("library-book-search-input").value.trim();
    const genre = document.getElementById("genre-filter").value;
    const rating = document.getElementById("rating-filter").value;
    const read = document.getElementById("read-filter").checked;
    const unread = document.getElementById("unread-filter").checked;

    const filters = {};
    if (genre) filters.genre = genre;
    if (rating) filters.rating = rating;
    if (read && !unread) filters.read = 'true';
    if (unread && !read) filters.read = 'false';
    if (read && unread) {
        // If both are checked, do not filter by read status
    }

    viewLibraryBooks(currentLibrary.id, query, filters);
}

/* ------------------- Toggle View and Sort ------------------- */

// Toggle View Mode
function toggleView(context) {
    viewMode = viewMode === 'list' ? 'grid' : 'list';
    if (context === 'search') {
        searchBooks();
    } else if (context === 'library' && currentLibrary) {
        viewLibraryBooks(currentLibrary.id);
    } else if (context === 'selected_library' && currentLibrary) {
        viewLibraryBooks(currentLibrary.id);
    }
}

// Toggle Sort Order
function toggleSortOrder(order) {
    sortOrder = order;
    if (currentLibrary) {
        viewLibraryBooks(currentLibrary.id);
    }
}

/* ------------------- Barcode Scanning Functions ------------------- */

// Initialize Barcode Scanner
function initializeBarcodeScanner() {
    // Global Event Listener for Barcode Scanning
    document.addEventListener('keydown', function(event) {
        // If the key pressed is 'Enter', process the barcode
        if (event.key === 'Enter') {
            if (barcode.length > 0) {
                handleBarcode(barcode);
                barcode = '';
                clearTimeout(barcodeTimeout);
            }
            return;
        }
        
        // Append the character to the barcode string
        barcode += event.key;
        
        // Clear the previous timeout and set a new one
        clearTimeout(barcodeTimeout);
        barcodeTimeout = setTimeout(() => {
            barcode = '';
        }, barcodeTimeoutDuration);
    });
}

// Restart Barcode Scanner
function restartBarcodeScanner() {
    // If using a barcode scanning library, reinitialize it here
    // For keyboard-based barcode scanners, no action is needed
    // This function can be used to reset the barcode buffer if necessary
    barcode = '';
    clearTimeout(barcodeTimeout);
}

// Handle Barcode Data Based on Context
function handleBarcode(barcodeData) {
    console.log("Barcode scanned:", barcodeData);
    
    // Perform a search using the barcode data
    fetch(`/search?q=${encodeURIComponent(barcodeData)}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(data.error);
                return;
            }

            if (data.length > 0) {
                const book = data[0]; // Assuming the first result is the desired book

                if (currentBookListSource === 'search') {
                    // Display book details in Search Tab
                    showBookDetails(book, false);
                } else if (currentBookListSource === 'library') {
                    // Add book to Library Tab
                    addBookToLibrary(book);
                }
            } else {
                showToast("Book not found.");
            }
        })
        .catch(error => {
            console.error("Error handling barcode:", error);
            showToast("Error processing barcode.");
        });
}

/* ------------------- Delete Book from Library ------------------- */

// Delete Book from Library
function deleteBookFromLibrary(bookId) {
    if (!currentLibrary) {
        showToast("No library selected.");
        return;
    }

    if (!confirm("Are you sure you want to remove this book from the library?")) {
        return;
    }

    fetch(`/library/${currentLibrary.id}/books/${bookId}`, { // Corrected endpoint
        method: "DELETE",
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error);
            return;
        }
        showToast(data.message);
        viewLibraryBooks(currentLibrary.id);
        loadYourLibraries();
        loadLibrariesIntoNav();
    })
    .catch(error => {
        console.error("Error deleting book from library:", error);
        showToast("Error deleting book from library.");
    });
}
/**
 * Opens the Create Library Modal.
 */
function createLibraryPrompt() {
    // Get the modal element by its ID
    const modalElement = document.getElementById('create-library-modal');
    
    // Get the instance of the modal using Materialize
    const modalInstance = M.Modal.getInstance(modalElement);
    
    // Open the modal
    modalInstance.open();
}
/* ------------------- Barcode Scanning Functions End ------------------- */