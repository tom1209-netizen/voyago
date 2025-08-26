import csv
import json
import pandas as pd
import re


def clean_text(text: str) -> str:
    """Clean text: remove extra whitespace and unnecessary special characters."""
    if not text:
        return ""

    # Convert to string if not already
    text = str(text)

    # Remove escaped sequences first (literal \n, \r, \t, \xa0 in text)
    text = re.sub(r'\\[nrt]', ' ', text)
    text = re.sub(r'\\xa0', ' ', text)
    text = re.sub(r'\\u[0-9a-fA-F]{4}', ' ', text)

    # Remove actual special characters and unicode whitespace
    # This includes: newlines, carriage returns, tabs, non-breaking spaces, bullet points, etc.
    text = re.sub(r'[\n\r\t\f\v·•\u00a0\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]', ' ', text)

    # Remove other common problematic characters, keeping Vietnamese and common punctuation
    text = re.sub(r'[^\w\s.,!?;:()\-"''%/\u00c0-\u017f\u1ea0-\u1ef9]', ' ', text)

    # Collapse multiple whitespace into single space
    text = re.sub(r'\s+', ' ', text)

    # Clean up and strip
    text = text.strip()

    return text

def preprocess_csv(input_path: str, output_path: str):
    with open(input_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        all_rows = []
        for row in reader:
            # Clean text in each field while preserving column structure
            cleaned_row = {}
            for key, value in row.items():
                if value:
                    cleaned_row[key] = clean_text(str(value))
                else:
                    cleaned_row[key] = ""
            all_rows.append(cleaned_row)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

def preprocess_excel_to_json(input_path: str, output_path: str):
    """Convert Excel file to JSON without text cleaning."""
    try:
        # Read Excel file
        df = pd.read_excel(input_path)

        # Convert to JSON without any text cleaning
        all_rows = []
        for index, row in df.iterrows():
            row_dict = {}
            for column, value in row.items():
                if pd.notna(value):  # Check if value is not NaN
                    row_dict[column] = str(value)
                else:
                    row_dict[column] = ""
            all_rows.append(row_dict)

        # Save to JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(all_rows, f, ensure_ascii=False, indent=2)

        print(f"Successfully converted {input_path} to {output_path}")
        print(f"Total rows processed: {len(all_rows)}")
        print(f"Columns: {list(df.columns)}")

    except Exception as e:
        print(f"Error processing file: {str(e)}")

if __name__ == "__main__":
    input_file = "../data/tour_data.yml.csv"
    output_file = "../../server/src/store/tour_data_preprocessed.json"
    preprocess_csv(input_file, output_file)
    print(f"Processed data saved to {output_file}")

    input_file = "../data/travel_policy.xlsx"
    output_file = "../../server/src/store/travel_policy.json"
    preprocess_excel_to_json(input_file, output_file)
    print(f"Processed policy saved to {output_file}")
