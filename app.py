from flask import Flask, jsonify, render_template, request, send_file
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
import requests
import os
from dotenv import load_dotenv
from datetime import datetime
import csv
import io
from werkzeug.utils import secure_filename
import logging  # Added for logging

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///books.db'  # SQLite database
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///books.db'  # SQLite database
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Securely get the API key from environment variables
API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")
if not API_KEY:
    raise ValueError("No Google Books API key provided. Set 'GOOGLE_BOOKS_API_KEY' in your .env file.")

# Allowed file extensions for upload
ALLOWED_EXTENSIONS = {'csv'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Models
class Library(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    tags = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    books = db.relationship('Book', backref='library', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'tags': self.tags.split(', ') if self.tags else [],
            'created_at': self.created_at.strftime('%Y-%m-%d'),
            'book_count': len(self.books)
        }

class Book(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_books_id = db.Column(db.String(100))  # Google Books API ID
    title = db.Column(db.String(200))
    authors = db.Column(db.String(200))
    genres = db.Column(db.String(200))
    description = db.Column(db.Text)
    thumbnail = db.Column(db.String(200))
    tags = db.Column(db.String(200))
    library_id = db.Column(db.Integer, db.ForeignKey('library.id'), nullable=False)
    publisher = db.Column(db.String(200))
    publishedDate = db.Column(db.String(50))
    pageCount = db.Column(db.Integer)
    isbn = db.Column(db.String(20))
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)  # Read/Unread status
    rating = db.Column(db.Integer, default=0)  # 1-5 star rating

    def to_dict(self):
        return {
            'id': self.id,
            'google_books_id': self.google_books_id,
            'title': self.title,
            'authors': self.authors.split(', ') if self.authors else [],
            'genres': self.genres.split(', ') if self.genres else [],
            'description': self.description,
            'thumbnail': self.thumbnail,
            'tags': self.tags.split(', ') if self.tags else [],
            'publisher': self.publisher,
            'publishedDate': self.publishedDate,
            'pageCount': self.pageCount,
            'isbn': self.isbn,
            'added_at': self.added_at.strftime('%Y-%m-%d %H:%M:%S') if self.added_at else '',
            'is_read': self.is_read,
            'rating': self.rating
        }

# Routes
@app.route("/")
def home():
    """Render the main interface."""
    return render_template("index.html")

@app.route("/search", methods=["GET"])
def search_books():
    """Search for books using the Google Books API."""
    query = request.args.get("q")
    if not query:
        return jsonify({"error": "No query provided"}), 400

    url = f"https://www.googleapis.com/books/v1/volumes"
    params = {
        'q': query,
        'key': API_KEY,
        'maxResults': 40
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch data from Google Books API"}), 500

    data = response.json()
    results = []

    for item in data.get("items", []):
        volume_info = item.get("volumeInfo", {})
        industry_identifiers = volume_info.get("industryIdentifiers", [])
        isbn_13 = ''
        for identifier in industry_identifiers:
            if identifier.get('type') == 'ISBN_13':
                isbn_13 = identifier.get('identifier')
                break

        results.append({
            "google_books_id": item.get("id"),
            "title": volume_info.get("title", "Unknown Title"),
            "authors": volume_info.get("authors", ["Unknown Author"]),
            "genres": volume_info.get("categories", ["Unknown Genre"]),
            "description": volume_info.get("description", "No description available."),
            "thumbnail": volume_info.get("imageLinks", {}).get("thumbnail", ""),
            "publisher": volume_info.get("publisher", "Unknown Publisher"),
            "publishedDate": volume_info.get("publishedDate", "Unknown Date"),
            "pageCount": volume_info.get("pageCount", 0),
            "isbn": isbn_13,
        })
    return jsonify(results)

@app.route("/library", methods=["POST"])
def create_library():
    """Create a new library."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    library_name = data.get("name")
    if not library_name:
        return jsonify({"error": "Library name is required"}), 400

    tags = ', '.join(data.get("tags", []))

    if Library.query.filter(func.lower(Library.name) == func.lower(library_name)).first():
        return jsonify({"error": "Library already exists"}), 400

    new_library = Library(name=library_name, tags=tags)
    db.session.add(new_library)
    db.session.commit()
    return jsonify({"message": f"Library '{library_name}' created!"})

@app.route("/libraries", methods=["GET"])
def get_libraries():
    """Retrieve the list of libraries."""
    libraries = Library.query.all()
    return jsonify([lib.to_dict() for lib in libraries])

@app.route("/your_libraries", methods=["GET"])
def your_libraries():
    """Retrieve your libraries with export/import and search functionality."""
    search_query = request.args.get('search', '')
    if search_query:
        libraries = Library.query.filter(Library.name.ilike(f"%{search_query}%")).all()
    else:
        libraries = Library.query.all()
    return jsonify([lib.to_dict() for lib in libraries])

@app.route("/library/<int:library_id>/add", methods=["POST"])
def add_to_library(library_id):
    """Add a book to a specific library."""
    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": f"Library does not exist"}), 404

    book_data = request.json
    google_books_id = book_data.get("google_books_id")

    if Book.query.filter_by(google_books_id=google_books_id, library_id=library_id).first():
        return jsonify({"message": "Book already exists in the library."})

    new_book = Book(
        google_books_id=google_books_id,
        title=book_data.get("title"),
        authors=', '.join(book_data.get("authors", [])),
        genres=', '.join(book_data.get("genres", [])),
        description=book_data.get("description"),
        thumbnail=book_data.get("thumbnail"),
        library=library,
        publisher=book_data.get("publisher"),
        publishedDate=book_data.get("publishedDate"),
        pageCount=book_data.get("pageCount"),
        isbn=book_data.get("isbn"),
    )
    db.session.add(new_book)
    db.session.commit()
    return jsonify({"message": f"Book '{new_book.title}' added to library '{library.name}'!"})

@app.route("/library/<int:library_id>/books", methods=["GET"])
def get_library_books(library_id):
    """Retrieve books in a specific library with filtering options."""
    search_query = request.args.get('search', '')
    sort_order = request.args.get('sort', 'date_desc')
    filter_genre = request.args.get('genre', '')
    filter_rating = request.args.get('rating', '')
    filter_read = request.args.get('read', '')  # 'true' or 'false'

    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": f"Library does not exist"}), 404

    books_query = library.books

    # Search filter
    if search_query:
        books_query = [book for book in books_query if search_query.lower() in book.title.lower() or search_query.lower() in book.authors.lower()]

    # Genre filter
    if filter_genre:
        books_query = [book for book in books_query if filter_genre.lower() in [g.lower() for g in book.genres.split(', ')]]

    # Rating filter
    if filter_rating:
        try:
            rating_int = int(filter_rating)
            books_query = [book for book in books_query if book.rating == rating_int]
        except ValueError:
            pass  # Invalid rating value

    # Read/Unread filter
    if filter_read.lower() == 'true':
        books_query = [book for book in books_query if book.is_read]
    elif filter_read.lower() == 'false':
        books_query = [book for book in books_query if not book.is_read]

    # Sorting
    if sort_order == 'date_desc':
        books_query = sorted(books_query, key=lambda x: x.added_at or datetime.min, reverse=True)
    elif sort_order == 'date_asc':
        books_query = sorted(books_query, key=lambda x: x.added_at or datetime.min)
    elif sort_order == 'alpha_asc':
        books_query = sorted(books_query, key=lambda x: x.title or '')
    elif sort_order == 'alpha_desc':
        books_query = sorted(books_query, key=lambda x: x.title or '', reverse=True)

    books = [book.to_dict() for book in books_query]
    return jsonify(books)

@app.route("/your_libraries/export", methods=["GET"])
def export_your_libraries():
    """Export all libraries and books to a CSV file."""
    libraries = Library.query.all()
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        "Library Name",
        "Google Books ID",
        "ISBN",
        "Title",
        "Authors",
        "Genres",
        "Publisher",
        "Published Date",
        "Page Count",
        "Tags",
        "Description",
        "Thumbnail",
        "Date Added",
        "Is Read",
        "Rating"
    ])

    for lib in libraries:
        for book in lib.books:
            writer.writerow([
                lib.name,
                book.google_books_id,
                book.isbn,
                book.title,
                book.authors,
                book.genres,
                book.publisher,
                book.publishedDate,
                book.pageCount,
                book.tags,
                book.description,
                book.thumbnail,
                book.added_at.strftime('%Y-%m-%d %H:%M:%S') if book.added_at else '',
                book.is_read,
                book.rating
            ])

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name='libraries_export.csv'
    )

@app.route("/your_libraries/import", methods=["POST"])
def import_your_libraries():
    """Import libraries and books from an uploaded CSV file."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No file selected for uploading."}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        reader = csv.DictReader(file_stream)

        for row in reader:
            library_name = row.get("Library Name")
            if not library_name:
                continue  # Skip rows without a library name

            library = Library.query.filter_by(name=library_name).first()
            if not library:
                library = Library(name=library_name)
                db.session.add(library)
                db.session.commit()

            google_books_id = row.get("Google Books ID")
            isbn = row.get("ISBN")
            book_title = row.get("Title")

            existing_book = Book.query.filter_by(google_books_id=google_books_id, library_id=library.id).first()
            if existing_book:
                continue  # Skip duplicate books

            try:
                added_at = datetime.strptime(row.get("Date Added"), '%Y-%m-%d %H:%M:%S') if row.get("Date Added") else datetime.utcnow()
            except ValueError:
                added_at = datetime.utcnow()

            try:
                rating = int(row.get("Rating", 0))
                if rating < 0 or rating > 5:
                    rating = 0
            except ValueError:
                rating = 0

            is_read = row.get("Is Read", 'False').lower() == 'true'

            new_book = Book(
                google_books_id=google_books_id,
                isbn=isbn,
                title=book_title,
                authors=row.get("Authors"),
                genres=row.get("Genres"),
                publisher=row.get("Publisher"),
                publishedDate=row.get("Published Date"),
                pageCount=int(row.get("Page Count") or 0),
                tags=row.get("Tags"),
                description=row.get("Description"),
                thumbnail=row.get("Thumbnail"),
                added_at=added_at,
                is_read=is_read,
                rating=rating,
                library=library
            )
            db.session.add(new_book)
        db.session.commit()
        return jsonify({"message": "Import successful."}), 200
    else:
        return jsonify({"error": "Allowed file types are csv."}), 400

@app.route("/book/<int:book_id>/refresh_image", methods=["POST"])
def refresh_book_image(book_id):
    """Refresh the thumbnail image of a saved book."""
    book = Book.query.get(book_id)
    if not book:
        return jsonify({"error": "Book not found"}), 404

    # Fetch updated data from Google Books API using google_books_id
    url = f"https://www.googleapis.com/books/v1/volumes/{book.google_books_id}"
    params = {'key': API_KEY}
    response = requests.get(url, params=params)
    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch data from Google Books API"}), 500

    data = response.json()
    volume_info = data.get("volumeInfo", {})
    new_thumbnail = volume_info.get("imageLinks", {}).get("thumbnail", "")

    if new_thumbnail:
        book.thumbnail = new_thumbnail
        db.session.commit()
        return jsonify({"message": "Thumbnail updated successfully.", "thumbnail": new_thumbnail}), 200
    else:
        return jsonify({"error": "No thumbnail available for this book."}), 404

@app.route("/book/<int:book_id>/update_status", methods=["POST"])
def update_book_status(book_id):
    """Update the read/unread status of a book."""
    data = request.get_json()
    if not data or 'is_read' not in data:
        return jsonify({"error": "No status provided."}), 400

    book = Book.query.get(book_id)
    if not book:
        return jsonify({"error": "Book not found."}), 404

    book.is_read = data['is_read']
    db.session.commit()
    return jsonify({"message": "Book status updated.", "is_read": book.is_read}), 200

@app.route("/book/<int:book_id>/update_rating", methods=["POST"])
def update_book_rating(book_id):
    """Update the star rating of a book."""
    data = request.get_json()
    if not data or 'rating' not in data:
        return jsonify({"error": "No rating provided."}), 400

    try:
        rating = int(data['rating'])
        if rating < 1 or rating > 5:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Invalid rating. Must be an integer between 1 and 5."}), 400

    book = Book.query.get(book_id)
    if not book:
        return jsonify({"error": "Book not found."}), 404

    book.rating = rating
    db.session.commit()
    return jsonify({"message": "Book rating updated.", "rating": book.rating}), 200

# Route to Update Book Tags
@app.route("/book/<int:book_id>/tags", methods=["POST"])
def update_book_tags(book_id):
    """Update the tags of a specific book."""
    data = request.get_json()
    if not data or 'tags' not in data:
        return jsonify({"error": "No tags provided."}), 400

    book = Book.query.get(book_id)
    if not book:
        return jsonify({"error": "Book not found."}), 404

    tags = data['tags']
    if isinstance(tags, list):
        book.tags = ', '.join(tags)
    elif isinstance(tags, str):
        book.tags = tags
    else:
        return jsonify({"error": "Invalid tags format."}), 400

    db.session.commit()
    return jsonify({"message": "Tags updated successfully.", "tags": book.tags}), 200

# Route to Delete a Specific Book from a Library
# Add the new DELETE route here
@app.route("/library/<int:library_id>/books/<int:book_id>", methods=["DELETE"])
def delete_book_from_library(library_id, book_id):
    """
    Delete a specific book from a library.
    """
    # Fetch the library
    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": "Library not found."}), 404

    # Fetch the book
    book = Book.query.get(book_id)
    if not book or book.library_id != library_id:
        return jsonify({"error": "Book not found in the specified library."}), 404

    # Delete the book
    db.session.delete(book)
    db.session.commit()

    return jsonify({"message": f"Book '{book.title}' has been removed from library '{library.name}'."}), 200


# Route to Delete a Specific Library
@app.route("/library/<int:library_id>", methods=["DELETE"], strict_slashes=False)
def delete_library(library_id):
    """Delete a specific library and its books."""
    logger.info(f"Received DELETE request for Library ID: {library_id}")
    library = Library.query.get(library_id)
    if not library:
        logger.warning(f"Library with ID {library_id} not found.")
        return jsonify({"error": "Library not found."}), 404

    db.session.delete(library)
    db.session.commit()
    logger.info(f"Library '{library.name}' and its books have been deleted.")
    return jsonify({"message": f"Library '{library.name}' and its books have been deleted."}), 200


# Initialize the database
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True)