import React, { useState } from 'react';
import { Upload, LogIn, UserPlus, Brain, Image, ChevronRight, User, LogOut, Moon, Sun, History, Clock } from 'lucide-react';

const CNNImageClassifier = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [user, setUser] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [history, setHistory] = useState([]);

  // Login handler
  const handleLogin = async (e) => {
  e.preventDefault();

  const res = await fetch("http://localhost:5173/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginForm)
  });

  const data = await res.json();

  if (res.ok) {
    setUser({ email: data.email });
    setCurrentPage("main");
  } else {
    alert("Invalid login credentials");
  }
};


  // Registration handler
  const handleRegister = async (e) => {
  e.preventDefault();

  const res = await fetch("http://localhost:5173/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerForm)
  });

  const data = await res.json();

  if (res.ok) {
    setUser({ email: registerForm.email });
    setCurrentPage("main");
  } else {
    alert(data.detail);
  }
};


  // Image upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        setPrediction(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Simulate prediction
  const handlePredict = () => {
    setIsLoading(true);
    setTimeout(() => {
      const newPrediction = {
        class: 'Golden Retriever',
        confidence: 94.7,
        model: 'VGG16',
        topPredictions: [
          { class: 'Golden Retriever', confidence: 94.7 },
          { class: 'Labrador', confidence: 3.2 },
          { class: 'German Shepherd', confidence: 1.5 }
        ],
        timestamp: new Date().toLocaleString(),
        image: selectedImage
      };
      setPrediction(newPrediction);
      setHistory([newPrediction, ...history]);
      setIsLoading(false);
    }, 2000);
  };

  // Logout handler
  const handleLogout = () => {
    setUser(null);
    setSelectedImage(null);
    setPrediction(null);
    setHistory([]);
    setCurrentPage('login');
  };

  // Login Page
  if (currentPage === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">CNN Classifier</h1>
            <p className="text-gray-600 mt-2">Image Classification with Deep Learning</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Sign In
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Don't have an account?{' '}
              <button
                onClick={() => setCurrentPage('register')}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Registration Page
  if (currentPage === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Create Account</h1>
            <p className="text-gray-600 mt-2">Join our CNN classification platform</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={registerForm.confirmPassword}
                onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={handleRegister}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Create Account
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <button
                onClick={() => setCurrentPage('login')}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main Page (Dashboard)
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>CNN Image Classifier</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-700'} hover:opacity-80 transition`}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <User className="w-5 h-5" />
              <span className="font-medium">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 px-4 py-2 ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} rounded-lg transition`}
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6`}>
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
              <Upload className="w-6 h-6 text-indigo-600" />
              Upload Image
            </h2>

            <div className={`border-2 border-dashed ${isDarkMode ? 'border-gray-600' : 'border-gray-300'} rounded-lg p-8 text-center hover:border-indigo-400 transition`}>
              {!selectedImage ? (
                <label className="cursor-pointer block">
                  <Image className={`w-16 h-16 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} mx-auto mb-4`} />
                  <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-2`}>Click to upload or drag and drop</p>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>PNG, JPG, JPEG up to 10MB</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div>
                  <img
                    src={selectedImage}
                    alt="Preview"
                    className="max-h-64 mx-auto rounded-lg mb-4"
                  />
                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      setPrediction(null);
                    }}
                    className={`text-sm ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}
                  >
                    Remove Image
                  </button>
                </div>
              )}
            </div>

            {selectedImage && !prediction && (
              <button
                onClick={handlePredict}
                disabled={isLoading}
                className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:bg-gray-400"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-5 h-5" />
                    Classify Image
                  </>
                )}
              </button>
            )}
          </div>

          {/* Results Section */}
          <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6`}>
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'} mb-4`}>Prediction Results</h2>

            {!prediction ? (
              <div className="text-center py-12">
                <Brain className={`w-16 h-16 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                <p className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Upload an image and click classify to see results</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className={`${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-50'} rounded-lg p-4`}>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Top Prediction</p>
                  <p className="text-2xl font-bold text-indigo-600">{prediction.class}</p>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mt-1`}>
                    Confidence: {prediction.confidence}%
                  </p>
                </div>

                <div>
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-3`}>All Predictions</p>
                  <div className="space-y-2">
                    {prediction.topPredictions.map((pred, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{pred.class}</span>
                        <div className="flex items-center gap-3">
                          <div className={`w-32 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-2`}>
                            <div
                              className="bg-indigo-600 h-2 rounded-full"
                              style={{ width: `${pred.confidence}%` }}
                            ></div>
                          </div>
                          <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} w-12`}>
                            {pred.confidence}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`pt-4 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} border-t`}>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Model: <span className="font-semibold">{prediction.model}</span>
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setPrediction(null);
                  }}
                  className={`w-full ${isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} py-2 rounded-lg font-semibold transition`}
                >
                  Classify Another Image
                </button>
              </div>
            )}
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6 mt-8`}>
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'} mb-4 flex items-center gap-2`}>
              <History className="w-6 h-6 text-indigo-600" />
              Classification History
            </h2>
            <div className="space-y-4">
              {history.map((item, idx) => (
                <div key={idx} className={`flex items-center gap-4 p-4 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                  <img src={item.image} alt="History" className="w-20 h-20 object-cover rounded-lg" />
                  <div className="flex-1">
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{item.class}</p>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Confidence: {item.confidence}%</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'} flex items-center gap-1 mt-1`}>
                      <Clock className="w-3 h-3" />
                      {item.timestamp}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isDarkMode ? 'bg-indigo-900 text-indigo-200' : 'bg-indigo-100 text-indigo-700'}`}>
                    {item.model}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CNNImageClassifier;