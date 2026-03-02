import Link from "next/link";

const universities = [
    {
        id: "uq",
        name: "University of Queensland",
        shortName: "UQ",
        location: "Brisbane, Australia",
        color: "from-purple-500/20 to-purple-600/10",
        borderColor: "border-purple-500/30 hover:border-purple-400/50",
        textColor: "text-purple-300",
    },
    {
        id: "qut",
        name: "Queensland University of Technology",
        shortName: "QUT",
        location: "Brisbane, Australia",
        color: "from-blue-500/20 to-blue-600/10",
        borderColor: "border-blue-500/30 hover:border-blue-400/50",
        textColor: "text-blue-300",
    },
];

export default function Home() {
    return (
        <div className='flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900'>
            <main className='mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-20'>
                <div className='mb-12 text-center sm:mb-16'>
                    <h1 className='bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl'>
                        GradeMate
                    </h1>
                    <p className='mx-auto mt-4 max-w-xl text-lg text-slate-400'>
                        Track your semester progress, calculate grades, and see
                        what you need to hit your target.
                    </p>
                </div>

                <div className='mb-8'>
                    <h2 className='mb-4 text-sm font-medium uppercase tracking-wider text-slate-500'>
                        Select your university
                    </h2>
                    <div className='grid gap-4 sm:grid-cols-2'>
                        {universities.map((uni) => (
                            <Link
                                key={uni.id}
                                href={`/university/${uni.id}`}
                                className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br ${uni.color} ${uni.borderColor} p-6 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20`}
                            >
                                <div className='relative z-10'>
                                    <div className='flex items-center gap-3'>
                                        <span
                                            className={`text-2xl font-bold ${uni.textColor}`}
                                        >
                                            {uni.shortName}
                                        </span>
                                    </div>
                                    <p className='mt-2 font-medium text-slate-200'>
                                        {uni.name}
                                    </p>
                                    <p className='mt-1 text-sm text-slate-400'>
                                        {uni.location}
                                    </p>
                                </div>
                                <div className='absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-slate-500'>
                                    <svg
                                        className='h-6 w-6'
                                        fill='none'
                                        stroke='currentColor'
                                        viewBox='0 0 24 24'
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M9 5l7 7-7 7'
                                        />
                                    </svg>
                                </div>
                            </Link>
                        ))}

                        <div className='flex items-center justify-center rounded-xl border border-dashed border-slate-700/50 bg-slate-900/20 p-6 text-center'>
                            <p className='text-sm text-slate-500'>
                                More universities coming soon
                            </p>
                        </div>
                    </div>
                </div>

                <div className='mt-auto pt-12'>
                    <div className='rounded-xl border border-slate-800/50 bg-slate-900/30 p-6'>
                        <h3 className='font-medium text-slate-200'>
                            How it works
                        </h3>
                        <ul className='mt-4 space-y-3 text-sm text-slate-400'>
                            <li className='flex gap-3'>
                                <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-300'>
                                    1
                                </span>
                                <span>
                                    Add your courses — assessment items are
                                    loaded automatically from your university
                                </span>
                            </li>
                            <li className='flex gap-3'>
                                <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-300'>
                                    2
                                </span>
                                <span>
                                    Enter your marks as percentages or fractions
                                    (e.g. 17/20)
                                </span>
                            </li>
                            <li className='flex gap-3'>
                                <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-300'>
                                    3
                                </span>
                                <span>
                                    See what you need on remaining items to hit
                                    your target grade
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>
            </main>

            <footer className='border-t border-slate-800/50 py-6 text-center text-sm text-slate-500'>
                <a
                    href='https://buymeacoffee.com/vincelapore'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-2 transition-colors hover:text-slate-300'
                >
                    Buy Me a Coffee ☕
                </a>
            </footer>
        </div>
    );
}
