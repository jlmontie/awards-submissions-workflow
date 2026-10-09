'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileUploadProps {
  accept: string;
  maxFiles: number;
  maxSizeMB: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function FileUpload({
  accept,
  maxFiles,
  maxSizeMB,
  multiple = false,
  onFilesSelected,
  disabled = false,
}: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: accept.split(',').reduce((acc, type) => {
        acc[type.trim()] = [];
        return acc;
      }, {} as Record<string, string[]>),
      maxFiles,
      maxSize: maxSizeMB * 1024 * 1024,
      multiple,
      disabled,
    });

  // Dropzone rejects every file when the count is over maxFiles, so report
  // that once instead of listing each file.
  const tooManyFiles = fileRejections.some(({ errors }) =>
    errors.some((e) => e.code === 'too-many-files')
  );

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center">
          <svg
            className="w-12 h-12 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {isDragActive ? (
            <p className="text-primary-600 font-medium">Drop files here...</p>
          ) : (
            <>
              <p className="text-gray-700 font-medium mb-1">
                Drag & drop {multiple ? 'files' : 'a file'} here, or click to
                select
              </p>
              <p className="text-sm text-gray-500">
                {multiple ? `Up to ${maxFiles} files` : '1 file only'}, {maxSizeMB} MB max
                {multiple ? ' each' : ''}
              </p>
              {multiple && (
                <p className="text-sm text-gray-500 mt-1">
                  Select all files at once. Choosing files again replaces
                  your previous selection.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {tooManyFiles ? (
        <p className="mt-2 text-sm text-red-600 font-medium">
          You selected {fileRejections.length} files. Please select no more
          than {maxFiles}.
        </p>
      ) : fileRejections.length > 0 && (
        <div className="mt-2 text-sm text-red-600">
          <p className="font-medium">Some files were rejected:</p>
          <ul className="list-disc list-inside">
            {fileRejections.map(({ file, errors }) => (
              <li key={file.name}>
                {file.name}:{' '}
                {errors
                  .map((e) =>
                    e.code === 'file-too-large'
                      ? `File is larger than ${maxSizeMB} MB`
                      : e.message
                  )
                  .join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
