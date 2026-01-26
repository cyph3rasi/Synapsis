import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
    try {
        // Get the total number of commits
        const commitCount = execSync('git rev-list --count HEAD', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr
        }).trim();

        // Also get the short hash for reference
        const commitHash = execSync('git rev-parse --short HEAD', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        return NextResponse.json({ 
            count: parseInt(commitCount, 10),
            hash: commitHash,
            fullHash: execSync('git rev-parse HEAD', { 
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim()
        });
    } catch (error) {
        // If git is not available or not a git repo, return unknown
        return NextResponse.json({ 
            count: null,
            hash: 'unknown',
            fullHash: null
        });
    }
}
