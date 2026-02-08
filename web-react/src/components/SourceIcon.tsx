
import { 
  FileText, 
  MessageSquare, 
  Monitor, 
  BookOpen, 
  Notebook, 
  Globe, 
  Hash,
  FileCode,
  HelpCircle,
  Lightbulb,
  CheckCircle,
  Folder
} from 'lucide-react';
import type { UnitType } from '../types';

interface SourceIconProps {
  source?: string;
  format?: string;
  type?: UnitType;
  className?: string;
  size?: number;
}

export function SourceIcon({ source, format, type, className = "", size = 16 }: SourceIconProps) {
  // Map sources to icons
  if (source === 'claude' || source === 'chatgpt' || source === 'gemini') {
    return <MessageSquare size={size} className={className} />;
  }
  
  if (source === 'dropbox' || source === 'local' || source === 'local-file') {
    return <Folder size={size} className={className} />;
  }
  
  if (source === 'apple-notes') {
    return <Notebook size={size} className={className} />;
  }
  
  if (source === 'web-clipper') {
    return <Globe size={size} className={className} />;
  }
  
  if (source === 'google-docs') {
    return <FileText size={size} className={className} />;
  }

  // Fallback to format
  if (format === 'pdf') return <FileText size={size} className={className} />;
  if (format === 'html') return <Globe size={size} className={className} />;
  if (format === 'markdown' || format === 'txt') return <FileText size={size} className={className} />;

  // Fallback to type
  switch (type) {
    case 'insight': return <Lightbulb size={size} className={className} />;
    case 'code': return <FileCode size={size} className={className} />;
    case 'question': return <HelpCircle size={size} className={className} />;
    case 'reference': return <BookOpen size={size} className={className} />;
    case 'decision': return <CheckCircle size={size} className={className} />;
    default: return <Hash size={size} className={className} />;
  }
}
