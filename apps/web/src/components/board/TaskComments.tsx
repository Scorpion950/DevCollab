import React, { useState } from 'react';
import { useTaskComments } from '@/hooks/useTaskComments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';

interface TaskCommentsProps {
  taskId: string;
  projectId: string;
  workspaceId: string;
}

export const TaskComments: React.FC<TaskCommentsProps> = ({
  taskId,
  projectId,
  workspaceId,
}) => {
  const { comments, isLoading, addComment, deleteComment } = useTaskComments(taskId);
  const [newComment, setNewComment] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await addComment(newComment, mentions);
      setNewComment('');
      setMentions([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMentionInput = (text: string) => {
    // Extract mentions (simple regex: @username)
    const mentionRegex = /@(\w+)/g;
    const matches = text.match(mentionRegex) || [];
    setMentions(matches.map((m) => m.slice(1))); // Remove @ prefix
  };

  return (
    <div className="space-y-4">
      {/* Comment Input */}
      <div className="space-y-2">
        <Input
          value={newComment}
          onChange={(e) => {
            setNewComment(e.target.value);
            handleMentionInput(e.target.value);
          }}
          placeholder="Add a comment... (use @username to mention)"
          className="bg-surface-elevated border-border"
        />
        <Button
          onClick={handleAddComment}
          disabled={!newComment.trim() || isSubmitting}
          size="sm"
        >
          {isSubmitting ? 'Posting...' : 'Post Comment'}
        </Button>
      </div>

      {/* Comments List */}
      {isLoading ? (
        <div className="text-sm text-text-muted">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="text-sm text-text-muted">No comments yet</div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 bg-surface-elevated rounded-lg border border-border"
            >
              {/* Comment Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={comment.author.avatar || ''} />
                    <AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {comment.author.name}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Comment Content */}
              <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                {comment.content}
              </p>

              {/* Mentions Badges */}
              {comment.mentions && comment.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {comment.mentions.map((mention) => (
                    <Badge key={mention} variant="secondary" className="text-xs">
                      @{mention}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
