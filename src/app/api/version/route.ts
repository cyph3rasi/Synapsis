import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
    try {
        // Get the total number of commits
        const commitCount = execSync('git rev-list --count HEAD', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr
        }).trim();

        // Get the short hash for reference
        const commitHash = execSync('git rev-parse --short HEAD', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const fullHash = execSync('git rev-parse HEAD', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        // Try to get the GitHub repo URL
        let githubUrl = null;
        try {
            const remoteUrl = execSync('git config --get remote.origin.url', {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();

            // Convert git URL to GitHub web URL
            // Handle both SSH (git@github.com:user/repo.git) and HTTPS (https://github.com/user/repo.git)
            if (remoteUrl.includes('github.com')) {
                let cleanUrl = remoteUrl
                    .replace('git@github.com:', 'https://github.com/')
                    .replace(/\.git$/, '');
                
                githubUrl = `${cleanUrl}/commit/${fullHash}`;
            }
        } catch (e) {
            // If we can't get the remote URL, that's okay
        }

        return NextResponse.json({ 
            count: parseInt(commitCount, 10),
            hash: commitHash,
            fullHash: fullHash,
            githubUrl: githubUrl
        });
    } catch (error) {
        // If git is not available or not a git repo, return unknown
        return NextResponse.json({ 
            count: null,
            hash: 'unknown',
            fullHash: null,
            githubUrl: null
        });
    }
}
