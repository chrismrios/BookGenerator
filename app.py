from flask import Flask, jsonify, render_template, request, send_file
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
import requests
import os
from dotenv import load_dotenv
from datetime import datetime
import csv
import io

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///books.db'  # SQLite database
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Securely get the API key from environment variables
API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")
if not API_KEY:
    raise ValueError("No Google Books API key provided. Set 'GOOGLE_BOOKS_API_KEY' in your .env file.")

class Library(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    tags = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    books = db.relationship('Book', backref='library', lazy=True, cascade="all, delete-orphan")

class Book(db.Model):
    id = db.Column(db.Integer, primary_key=True)  # Auto-incrementing integer
    book_id = db.Column(db.String(100))  # Google Books API ID
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

    url = f"https://www.googleapis.com/books/v1/volumes?q={query}&key={API_KEY}&maxResults=40"
    response = requests.get(url)
    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch data from Google Books API"}), 500

    data = response.json()
    results = []

    # Process the results to include only relevant information
    for item in data.get("items", []):
        volume_info = item.get("volumeInfo", {})
        industry_identifiers = volume_info.get("industryIdentifiers", [])
        isbn_13 = ''
        for identifier in industry_identifiers:
            if identifier.get('type') == 'ISBN_13':
                isbn_13 = identifier.get('identifier')
                break

        results.append({
            "book_id": item.get("id"),
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

    tags = ','.join(data.get("tags", []))

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
    libraries_list = []
    for lib in libraries:
        libraries_list.append({
            "id": lib.id,
            "name": lib.name,
            "tags": lib.tags.split(',') if lib.tags else [],
            "created_at": lib.created_at.strftime('%Y-%m-%d'),
            "book_count": len(lib.books)
        })
    return jsonify(libraries_list)

@app.route("/library/<int:library_id>/add", methods=["POST"])
def add_to_library(library_id):
    """Add a book to a specific library."""
    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": f"Library does not exist"}), 404

    book_data = request.json
    book_id = book_data.get("book_id")

    if Book.query.filter_by(book_id=book_id, library_id=library_id).first():
        return jsonify({"message": "Book already exists in the library."})

    new_book = Book(
        book_id=book_id,
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
    """Retrieve books in a specific library."""
    search_query = request.args.get('search', '')
    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": f"Library does not exist"}), 404

    books_query = library.books
    if search_query:
        books_query = [book for book in books_query if search_query.lower() in book.title.lower() or search_query.lower() in book.authors.lower()]

    books = [
        {
            "id": book.id,
            "book_id": book.book_id,
            "title": book.title,
            "authors": book.authors.split(', ') if book.authors else [],
            "genres": book.genres.split(', ') if book.genres else [],
            "description": book.description,
            "thumbnail": book.thumbnail,
            "tags": book.tags.split(', ') if book.tags else [],
            "publisher": book.publisher,
            "publishedDate": book.publishedDate,
            "pageCount": book.pageCount,
            "isbn": book.isbn,
            "added_at": book.added_at.strftime('%Y-%m-%d %H:%M:%S') if book.added_at else ''
        }
        for book in books_query
    ]
    # Sort books by added_at in descending order
    books.sort(key=lambda x: x.get('added_at', ''), reverse=True)
    return jsonify(books)

@app.route("/library/<int:library_id>", methods=["DELETE"])
def delete_library(library_id):
    """Delete a specific library."""
    library = Library.query.get(library_id)
    if not library:
        return jsonify({"error": f"Library does not exist"}), 404

    db.session.delete(library)
    db.session.commit()
    return jsonify({"message": f"Library '{library.name}' deleted!"})

@app.route("/book/<int:book_id>/tags", methods=["POST"])
def add_tags_to_book(book_id):
    """Add or update tags for a book."""
    data = request.json
    new_tags = data.get("tags", [])

    book = Book.query.get(book_id)
    if not book:
        return jsonify({"error": "Book not found"}), 404

    # Update tags based on the provided list
    book.tags = ', '.join(new_tags)
    db.session.commit()
    return jsonify({"message": "Tags updated successfully."})

@app.route("/library/<int:library_id>/book/<int:book_id>", methods=["DELETE"])
def delete_book_from_library(library_id, book_id):
    """Delete a book from a library."""
    book = Book.query.filter_by(id=book_id, library_id=library_id).first()
    if not book:
        return jsonify({"error": "Book not found in the library."}), 404

    db.session.delete(book)
    db.session.commit()
    return jsonify({"message": f"Book '{book.title}' deleted from library."})

@app.route("/export", methods=["GET"])
def export_libraries():
    """Export all libraries and books to a CSV file."""
    libraries = Library.query.all()
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        "Library Name",
        "Book ID",
        "ISBN",
        "Title",
        "Authors",
        "Genres",
        "Publisher",
        "Published Date",
        "Page Count",
        "Tags",
        "Description",
        "Date Added"
    ])

    for lib in libraries:
        for book in lib.books:
            writer.writerow([
                lib.name,
                book.book_id,
                book.isbn,
                book.title,
                book.authors,
                book.genres,
                book.publisher,
                book.publishedDate,
                book.pageCount,
                book.tags,
                book.description,
                book.added_at.strftime('%Y-%m-%d %H:%M:%S') if book.added_at else ''
            ])

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name='libraries_export.csv'  # Updated parameter name
    )

if __name__ == "__main__":
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
    app.run(debug=True)