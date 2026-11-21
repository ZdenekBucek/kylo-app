CREATE TABLE document_folders (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES document_folders(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX document_folder_siblings ON document_folders (parent_id, lower(name)) NULLS NOT DISTINCT;

CREATE TABLE documents (
  id uuid PRIMARY KEY,
  folder_id uuid REFERENCES document_folders(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(description) <= 2000),
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 255),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  ready boolean NOT NULL DEFAULT false
);
CREATE INDEX documents_in_folder ON documents (folder_id, name) WHERE ready;
CREATE INDEX documents_unfinished ON documents (created_at) WHERE NOT ready;

CREATE TABLE document_chunks (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  part integer NOT NULL CHECK (part >= 0),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 786432),
  PRIMARY KEY (document_id, part)
);
